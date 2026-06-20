import { and, eq, lte, sql } from 'drizzle-orm';
import { db } from '../db';
import { productSubscriptions } from '../db/schema';
import { createOrderForUser } from '../services/customer/cart.service';

/**
 * Recurring subscription runner.
 *
 * Periodically scans `product_subscriptions` for active rows whose
 * `nextOrderDate` is due (<= today), places a real order for each via the
 * shared order pipeline, then advances `nextOrderDate` by `frequencyDays`.
 *
 * This is what turns "subscribe & save" from data-entry into an actual
 * recurring purchase. A subscription whose order fails (e.g. out of stock)
 * is left untouched so it retries on the next tick rather than silently
 * skipping the customer's delivery.
 */

const TICK_MS = Number(Bun.env.SUBSCRIPTION_TICK_MS) || 60 * 60 * 1000; // hourly

function today(): string {
  return new Date().toISOString().split('T')[0]!;
}

function addDays(fromISODate: string, days: number): string {
  const d = new Date(fromISODate + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0]!;
}

export async function runDueSubscriptions(): Promise<{ processed: number; ordered: number; failed: number }> {
  const due = await db
    .select()
    .from(productSubscriptions)
    .where(and(eq(productSubscriptions.isActive, true), lte(productSubscriptions.nextOrderDate, today())));

  let ordered = 0;
  let failed = 0;

  for (const sub of due) {
    const result = await createOrderForUser(
      sub.userId,
      [{ productId: sub.productId, quantity: sub.quantity ?? 1 }],
      { source: 'subscription' },
    );

    if ((result as any).error) {
      failed++;
      console.warn(`[subscriptions] order failed for sub ${sub.id}: ${(result as any).error} — will retry next tick`);
      continue;
    }

    const base = sub.nextOrderDate ?? today();
    await db
      .update(productSubscriptions)
      .set({ nextOrderDate: addDays(base, sub.frequencyDays), lastOrderedAt: sql`now()` })
      .where(eq(productSubscriptions.id, sub.id));
    ordered++;
  }

  if (due.length) {
    console.log(`[subscriptions] processed ${due.length} due — ${ordered} ordered, ${failed} failed`);
  }
  return { processed: due.length, ordered, failed };
}

/** Start the periodic runner. Returns the interval handle so callers can stop it. */
export function startSubscriptionRunner(): ReturnType<typeof setInterval> {
  // Kick once on boot (after a short delay so the server is listening), then on a fixed interval.
  setTimeout(() => { runDueSubscriptions().catch((e) => console.error('[subscriptions] tick error', e)); }, 10_000);
  return setInterval(() => {
    runDueSubscriptions().catch((e) => console.error('[subscriptions] tick error', e));
  }, TICK_MS);
}
