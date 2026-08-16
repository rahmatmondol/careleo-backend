import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/shared/db';
import { addresses, cartItems, products, orders, orderItems, productInventoryLogs } from '@/shared/db/schema';
import { commitUsage, resolveCoverage, type CoverageInput } from '@/modules/subscriptions/coverage';

/** Thrown inside the order transaction to roll back and surface a clean error. */
class OrderError extends Error {
  status: number;
  constructor(message: string, status = 400){ super(message); this.status = status; }
}

export async function listCart(userId: string){
  const items = await db.select({ id: cartItems.id, userId: cartItems.userId, productId: cartItems.productId, quantity: cartItems.quantity, createdAt: cartItems.createdAt, product: { id: products.id, name: products.name, brand: products.brand, price: products.price, imageUrl: products.imageUrl } }).from(cartItems).leftJoin(products, eq(cartItems.productId, products.id)).where(eq(cartItems.userId, userId)).orderBy(desc(cartItems.createdAt));
  return { cart: items };
}
export async function addCart(userId: string, b: any){
  const existing = await db.select().from(cartItems).where(and(eq(cartItems.userId, userId), eq(cartItems.productId, b.productId)));
  if (existing.length){ const result = await db.update(cartItems).set({ quantity: existing[0].quantity + (b.quantity || 1) }).where(eq(cartItems.id, existing[0].id)).returning(); return { message: 'Cart updated', item: result[0] }; }
  const result = await db.insert(cartItems).values({ userId, productId: b.productId, quantity: b.quantity || 1 }).returning();
  return { message: 'Added to cart', item: result[0] };
}
export async function updateCartItem(userId: string, itemId: string, quantity: number){
  const result = await db.update(cartItems).set({ quantity }).where(and(eq(cartItems.id, itemId), eq(cartItems.userId, userId))).returning();
  if (!result.length) return { error: 'Cart item not found', status: 404 };
  return { message: 'Cart item updated', item: result[0] };
}
export async function removeCartItem(userId: string, itemId: string){
  const result = await db.delete(cartItems).where(and(eq(cartItems.id, itemId), eq(cartItems.userId, userId))).returning();
  if (!result.length) return { error: 'Cart item not found', status: 404 };
  return { message: 'Item removed from cart' };
}

/** Flatten a saved address into the snapshot stored on the order. */
const formatAddress = (a: typeof addresses.$inferSelect): string =>
  [
    a.fullName,
    a.phone,
    a.line1,
    a.line2,
    a.city,
    [a.state, a.postalCode].filter(Boolean).join(' '),
    a.country,
  ]
    .filter((part) => part && String(part).trim())
    .join(', ')
    .slice(0, 500);

/**
 * Resolve which address an order ships to.
 *
 * Both the id and a flattened copy are kept: the id links the order to the
 * saved address, the copy freezes it. Editing or deleting a saved address must
 * never rewrite where a past order was delivered.
 *
 * Background orders (subscription runs, AI auto re-order) pass no address, so
 * they fall back to the user's default one instead of shipping to nowhere —
 * which is what they did before.
 */
const resolveShippingAddress = async (
  userId: string,
  addressId?: string | null,
  fallbackText?: string | null,
): Promise<{ addressId: string | null; shippingAddress: string | null } | { error: string; status: number }> => {
  if (addressId) {
    const [row] = await db
      .select()
      .from(addresses)
      .where(and(eq(addresses.id, addressId), eq(addresses.userId, userId)));
    if (!row) return { error: 'Address not found', status: 404 };
    return { addressId: row.id, shippingAddress: formatAddress(row) };
  }

  if (fallbackText) return { addressId: null, shippingAddress: String(fallbackText).slice(0, 500) };

  const [fallback] = await db
    .select()
    .from(addresses)
    .where(and(eq(addresses.userId, userId), eq(addresses.isDefault, true)))
    .limit(1);
  return fallback
    ? { addressId: fallback.id, shippingAddress: formatAddress(fallback) }
    : { addressId: null, shippingAddress: null };
};

/**
 * Preview a cart: line prices, what the subscription covers, what is payable.
 *
 * Read-only and advisory. Checkout recomputes all of it under a lock — the
 * remaining benefit budget can change between the two calls (another device, a
 * scheduled re-order, a plan change), so this result is never trusted as input.
 */
export async function quoteCart(userId: string, addressId?: string | null){
  const rows = await db
    .select({
      cartItemId: cartItems.id,
      quantity: cartItems.quantity,
      productId: products.id,
      name: products.name,
      price: products.price,
      imageUrl: products.imageUrl,
      stock: products.stock,
      categoryId: products.categoryId,
      subscriptionIncluded: products.subscriptionIncluded,
    })
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
    .where(eq(cartItems.userId, userId))
    .orderBy(desc(cartItems.createdAt));

  const coverage = await resolveCoverage(
    userId,
    rows.map((r): CoverageInput => ({
      productId: r.productId,
      name: r.name,
      quantity: r.quantity,
      unitPrice: Number(r.price),
      categoryId: r.categoryId,
      subscriptionIncluded: !!r.subscriptionIncluded,
    })),
  );

  const address = await resolveShippingAddress(userId, addressId ?? null);
  if ('error' in address) return address;

  const lines = coverage.lines.map((line, i) => ({
    cartItemId: rows[i]!.cartItemId,
    productId: line.productId,
    name: line.name,
    imageUrl: rows[i]!.imageUrl,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    lineTotal: line.lineTotal,
    coveredQuantity: line.coveredQuantity,
    coveredAmount: line.coveredAmount,
    payableAmount: line.payableAmount,
    reason: line.reason,
    // Surfaced so the app can block checkout before the user picks a payment
    // method, rather than failing inside the order transaction.
    inStock: Number(rows[i]!.stock ?? 0) >= line.quantity,
  }));

  return {
    lines,
    subtotal: coverage.subtotal,
    coveredTotal: coverage.coveredTotal,
    payableTotal: coverage.payableTotal,
    requiresPayment: coverage.payableTotal > 0,
    benefit: coverage.benefit,
    address,
    outOfStock: lines.filter((l) => !l.inStock).map((l) => l.name),
  };
}

/**
 * Create an order for a user from explicit line items: price lookup, stock
 * validation, stock deduction, inventory log, subscription coverage, order +
 * order items. Shared by cart checkout, recurring subscriptions, and the
 * internal service-order endpoint (background re-orders).
 *
 * Runs inside a single DB transaction so a mid-way failure never leaves stock
 * decremented without a matching order. Rejects the whole order if any line
 * references a missing product or exceeds available stock (no overselling).
 *
 * Coverage is resolved *inside* the transaction with the benefit-usage row
 * locked, so two concurrent checkouts cannot both spend the same remaining
 * budget. Whatever the caller was told by `quoteCart` is recomputed here.
 *
 * Payment defaults to COD/PENDING; a fully covered order needs no payment at
 * all and is marked NOT_REQUIRED. Online providers set their own values once a
 * real gateway is wired in.
 */
export type CreateOrderOptions = {
  addressId?: string | null;
  shippingAddress?: string | null;
  paymentMethod?: string;
  source?: string;
  /** Background flows can opt out; on by default so auto re-orders benefit too. */
  applyCoverage?: boolean;
};

export async function createOrderForUser(userId: string, items: { productId: string; quantity: number }[], opts: CreateOrderOptions = {}){
  if (!items?.length) return { error: 'No items', status: 400 };

  const address = await resolveShippingAddress(userId, opts.addressId ?? null, opts.shippingAddress ?? null);
  if ('error' in address) return address;

  try {
    return await db.transaction(async (tx) => {
      const lines: (CoverageInput & { productName: string })[] = [];

      for (const item of items){
        const qty = Number(item.quantity || 0);
        if (qty <= 0) throw new OrderError('Invalid quantity for an item', 400);
        const rows = await tx.select().from(products).where(eq(products.id, item.productId));
        const prod = rows[0];
        if (!prod) throw new OrderError('One or more products are no longer available', 400);
        const available = Number(prod.stock || 0);
        if (available < qty) throw new OrderError(`Insufficient stock for ${prod.name}`, 409);

        lines.push({
          productId: prod.id,
          productName: prod.name,
          name: prod.name,
          quantity: qty,
          unitPrice: Number(prod.price),
          categoryId: prod.categoryId,
          subscriptionIncluded: !!prod.subscriptionIncluded,
        });

        await tx.update(products).set({ stock: available - qty }).where(eq(products.id, prod.id));
        await tx.insert(productInventoryLogs).values({ productId: prod.id, type: 'Sale', quantity: -qty, note: 'Stock deducted from order', actor: 'System' });
      }

      const coverage = opts.applyCoverage === false
        ? null
        : await resolveCoverage(userId, lines, { exec: tx, lock: true });

      const subtotal = coverage?.subtotal ?? lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
      const coveredTotal = coverage?.coveredTotal ?? 0;
      const payableTotal = coverage?.payableTotal ?? subtotal;

      const order = await tx.insert(orders).values({
        userId,
        totalAmount: String(subtotal),
        subtotal: String(subtotal),
        coveredAmount: String(coveredTotal),
        payableAmount: String(payableTotal),
        addressId: address.addressId,
        shippingAddress: address.shippingAddress,
        paymentMethod: opts.paymentMethod ?? 'COD',
        // Nothing to collect when the plan paid for the whole order.
        paymentStatus: payableTotal <= 0 ? 'NOT_REQUIRED' : 'PENDING',
        source: opts.source ?? 'checkout',
        benefitPeriodStart: coveredTotal > 0 ? coverage?.benefit?.periodStart ?? null : null,
        coverageMetaJson: coveredTotal > 0 ? JSON.stringify(coverage?.qtyByRule ?? {}) : null,
      }).returning();

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const covered = coverage?.lines[i];
        await tx.insert(orderItems).values({
          orderId: order[0]!.id,
          productId: line.productId,
          productName: line.productName,
          quantity: line.quantity,
          price: String(line.unitPrice),
          coveredQuantity: covered?.coveredQuantity ?? 0,
          coveredAmount: String(covered?.coveredAmount ?? 0),
        });
      }

      if (coverage && coverage.benefit && coveredTotal > 0) {
        await commitUsage(
          tx,
          userId,
          coverage.benefit.periodStart,
          coverage.benefit.periodEnd,
          coveredTotal,
          coverage.qtyByRule,
        );
      }

      return { message: 'Order placed', order: order[0] };
    });
  } catch (e) {
    if (e instanceof OrderError) return { error: e.message, status: e.status };
    throw e;
  }
}

export type CheckoutInput = {
  addressId?: string;
  paymentMethod?: string;
  /** Legacy free-text address; kept so older app builds keep working. */
  shippingAddress?: string;
};

/**
 * How the customer settles the payable part of an order.
 *
 * `ADVANCE` is a manually-verified transfer (bKash/bank), not a gateway: the
 * order is created PENDING and an admin marks it paid once the money lands.
 * There is no online provider wired in yet, so nothing here auto-confirms.
 */
const PAYMENT_METHODS = ['COD', 'ADVANCE'];

export async function checkout(userId: string, input: CheckoutInput = {}){
  const items = await db.select().from(cartItems).where(eq(cartItems.userId, userId));
  if (!items.length) return { error: 'Cart is empty', status: 400 };

  const paymentMethod = String(input.paymentMethod ?? 'COD').toUpperCase();
  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    return { error: `Payment method must be one of: ${PAYMENT_METHODS.join(', ')}`, status: 400 };
  }

  if (!input.addressId && !input.shippingAddress) {
    const [defaultAddress] = await db
      .select({ id: addresses.id })
      .from(addresses)
      .where(and(eq(addresses.userId, userId), eq(addresses.isDefault, true)))
      .limit(1);
    if (!defaultAddress) return { error: 'A delivery address is required', status: 400 };
  }

  const result = await createOrderForUser(
    userId,
    items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
    {
      addressId: input.addressId ?? null,
      shippingAddress: input.shippingAddress ?? null,
      paymentMethod,
      source: 'checkout',
    },
  );
  if ((result as any).error) return result;
  await db.delete(cartItems).where(eq(cartItems.userId, userId));
  return result;
}
