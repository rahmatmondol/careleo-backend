/**
 * Abandoned-Cart Recovery Job — runs hourly.
 *
 * Two halves, in this order:
 *
 * 1. **Recovery first.** Any reminder that has since been followed by an order
 *    is marked recovered. Doing this before sending means a customer who just
 *    bought is not also nagged in the same tick.
 * 2. **Send.** For each active rule, find carts whose newest item is older than
 *    the rule's trigger window and where nothing has been ordered since, then
 *    send one reminder per rule per cart.
 *
 * The cart signature is what makes this safe to run every hour: it is a hash of
 * the cart's contents, and the unique index on (rule, user, signature) means a
 * second tick over an unchanged cart inserts nothing. Change the cart and it
 * becomes a genuinely new cart, eligible again.
 */

import { createHash } from 'node:crypto';
import { and, desc, eq, gt, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import {
  abandonedCartEvents,
  abandonedCartRules,
  cartItems,
  coupons,
  orders,
  products,
} from '@/shared/db/schema';
import { deliverToUser } from '@/modules/notifications/deliver';

/** Cap per tick so a backlog cannot turn into a notification storm. */
const MAX_SENDS_PER_RUN = 200;

export type AbandonedCartResult = {
  recovered: number;
  sent: number;
  skipped: number;
};

/** Stable fingerprint of a cart's contents — order-independent. */
const cartSignature = (items: { productId: string; quantity: number }[]): string => {
  const canonical = items
    .map((i) => `${i.productId}:${i.quantity}`)
    .sort()
    .join('|');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 40);
};

/**
 * Close out reminders that worked.
 *
 * An order placed after the reminder counts as recovered. Attribution is
 * deliberately simple — first order after the send, within the window — because
 * anything cleverer (matching cart contents to order lines) would silently drop
 * the common case where the customer bought *something else* after being
 * reminded, which the reminder still caused.
 */
const markRecovered = async (): Promise<number> => {
  const pending = await db
    .select()
    .from(abandonedCartEvents)
    .where(isNull(abandonedCartEvents.recoveredOrderId))
    .limit(500);

  let recovered = 0;
  for (const event of pending) {
    const [order] = await db
      .select({ id: orders.id, payable: orders.payableAmount })
      .from(orders)
      .where(and(eq(orders.userId, event.userId), gt(orders.createdAt, event.sentAt)))
      .orderBy(orders.createdAt)
      .limit(1);
    if (!order) continue;

    await db
      .update(abandonedCartEvents)
      .set({
        recoveredOrderId: order.id,
        recoveredAmount: String(Number(order.payable ?? 0)),
        recoveredAt: new Date(),
      })
      .where(eq(abandonedCartEvents.id, event.id));
    recovered += 1;
  }
  return recovered;
};

export const runAbandonedCartJob = async (): Promise<AbandonedCartResult> => {
  const recovered = await markRecovered();

  const rules = await db
    .select()
    .from(abandonedCartRules)
    .where(eq(abandonedCartRules.isActive, true))
    .orderBy(desc(abandonedCartRules.triggerTimeHours));

  if (!rules.length) return { recovered, sent: 0, skipped: 0 };

  let sent = 0;
  let skipped = 0;

  for (const rule of rules) {
    if (sent >= MAX_SENDS_PER_RUN) break;

    const cutoff = new Date(Date.now() - rule.triggerTimeHours * 60 * 60 * 1000);

    // Carts whose *newest* item predates the window — someone still adding
    // things has not abandoned anything yet.
    const idleCarts = await db
      .select({
        userId: cartItems.userId,
        lastActivity: sql<string>`max(${cartItems.createdAt})`,
      })
      .from(cartItems)
      .groupBy(cartItems.userId)
      .having(lte(sql`max(${cartItems.createdAt})`, cutoff))
      .limit(MAX_SENDS_PER_RUN);

    const offer = rule.offerCouponId
      ? (await db.select().from(coupons).where(eq(coupons.id, rule.offerCouponId)).limit(1))[0]
      : undefined;

    for (const cart of idleCarts) {
      if (sent >= MAX_SENDS_PER_RUN) break;

      // Anything ordered since the cart went quiet means it was not abandoned.
      const [recentOrder] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.userId, cart.userId), gt(orders.createdAt, new Date(cart.lastActivity))))
        .limit(1);
      if (recentOrder) {
        skipped += 1;
        continue;
      }

      const items = await db
        .select({ productId: cartItems.productId, quantity: cartItems.quantity })
        .from(cartItems)
        .where(eq(cartItems.userId, cart.userId));
      if (!items.length) continue;

      const priceRows = await db
        .select({ id: products.id, price: products.price })
        .from(products)
        .where(inArray(products.id, items.map((i) => i.productId)));
      const priceById = new Map(priceRows.map((p) => [p.id, Number(p.price)]));
      const cartValue = items.reduce(
        (total, i) => total + (priceById.get(i.productId) ?? 0) * i.quantity,
        0,
      );

      const signature = cartSignature(items);

      // Claim the send before doing it. The unique index makes this the
      // deduplication point: if this rule already chased this exact cart,
      // nothing is inserted and nothing is sent.
      const [claim] = await db
        .insert(abandonedCartEvents)
        .values({
          ruleId: rule.id,
          userId: cart.userId,
          cartSignature: signature,
          cartValue: String(cartValue),
        })
        .onConflictDoNothing({
          target: [abandonedCartEvents.ruleId, abandonedCartEvents.userId, abandonedCartEvents.cartSignature],
        })
        .returning();
      if (!claim) {
        skipped += 1;
        continue;
      }

      const body = rule.templateBody || 'You left items in your cart — come back and finish checking out.';
      try {
        await deliverToUser(cart.userId, {
          title: rule.templateSubject || 'Still thinking it over?',
          body: offer ? `${body} Use code ${offer.code} at checkout.` : body,
          type: 'ABANDONED_CART',
          data: {
            ruleId: rule.id,
            cartValue: String(cartValue),
            ...(offer ? { couponCode: offer.code } : {}),
          },
        });
        sent += 1;
      } catch (err) {
        // The claim row stays. Deleting it to allow a retry would risk sending
        // twice if the failure was in the response rather than the send, and a
        // missed reminder is cheaper than nagging a customer twice.
        console.error(`[Jobs] abandoned-cart: send to ${cart.userId} failed:`, err);
      }
    }
  }

  return { recovered, sent, skipped };
};
