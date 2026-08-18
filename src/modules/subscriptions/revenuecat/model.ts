import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import { revenuecatEvents, userSubscriptions, users } from '@/shared/db/schema';

/** App user ids that are not uuids are anonymous RevenueCat ids, never our users. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RevenueCatEventRow = typeof revenuecatEvents.$inferSelect;
export type SubscriptionRow = typeof userSubscriptions.$inferSelect;

/**
 * The subscription state one RevenueCat event or reconcile resolves to.
 *
 * Only two statuses, because the interesting cases are all still *paid for*:
 * a cancelled subscription, one in a billing grace period and a paused Play
 * Store subscription all keep access until a date, and are expressed as
 * `active` with `currentPeriodEnd` set and `willRenew: false`. Giving each its
 * own status would mean every entitlement check had to know the full list, and
 * a missed one would cut off a user who has paid through the end of the month.
 */
export type RevenueCatSubscriptionState = {
  planId: string;
  status: 'active' | 'expired';
  store: string | null;
  rcAppUserId: string;
  rcEntitlementId: string | null;
  rcProductId: string | null;
  rcOriginalTransactionId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  willRenew: boolean;
  isTrial: boolean;
  /** RevenueCat's clock for this state — see `applyState` for why it matters. */
  eventAtMs: number | null;
};

export const RevenueCatModel = {
  // ── Customer identity ──────────────────────────────────────────────────────
  /**
   * Turn the app user ids on an event into a CareLeo user.
   *
   * Clients call `Purchases.logIn(user.id)`, so the app user id normally *is*
   * the user's uuid. It is checked against `users` rather than trusted: the
   * ids come from an inbound webhook, and `user_subscriptions.user_id` has a
   * foreign key that would reject an unknown one with a 500 mid-webhook.
   *
   * Several candidates are tried because a purchase made before sign-in is
   * attributed to `$RCAnonymousID:…`, and the real id then shows up as an
   * alias or as `original_app_user_id` once the SDK links them.
   */
  resolveUserId: async (candidates: (string | null | undefined)[]): Promise<string | null> => {
    // Only uuids can be user ids; anonymous ids and emails are dropped here so
    // they never reach Postgres as a malformed-uuid error.
    const uuids = [
      ...new Set(
        candidates
          .filter((c): c is string => typeof c === 'string' && UUID_RE.test(c.trim()))
          .map((c) => c.trim().toLowerCase()),
      ),
    ];
    if (!uuids.length) return null;

    const rows = await db.select({ id: users.id }).from(users).where(inArray(users.id, uuids));
    if (!rows.length) return null;

    // Preserve caller order — it is priority order, not arbitrary.
    const found = new Set(rows.map((r) => r.id));
    return uuids.find((id) => found.has(id)) ?? null;
  },

  // ── Event log ──────────────────────────────────────────────────────────────
  /**
   * Record an event, returning null if it has already been seen.
   *
   * RevenueCat retries a delivery until it gets a 2xx, so the same event
   * arrives more than once as a matter of course. The unique index on
   * `event_id` is what makes the retry a no-op: whoever inserts the row first
   * owns processing it, and every later delivery gets null here and returns
   * 200 without touching the subscription.
   */
  recordEvent: async (input: {
    eventId: string;
    type: string;
    appUserId: string | null;
    userId: string | null;
    productId: string | null;
    store: string | null;
    environment: string | null;
    eventTimestampMs: number | null;
    payload: Record<string, unknown>;
  }): Promise<RevenueCatEventRow | null> => {
    const [row] = await db
      .insert(revenuecatEvents)
      .values({
        eventId: input.eventId,
        type: input.type,
        appUserId: input.appUserId,
        userId: input.userId,
        productId: input.productId,
        store: input.store,
        environment: input.environment,
        eventTimestampMs: input.eventTimestampMs === null ? null : String(input.eventTimestampMs),
        payload: input.payload,
        status: 'received',
      })
      .onConflictDoNothing({ target: revenuecatEvents.eventId })
      .returning();
    return row ?? null;
  },

  /** Close out an event row with what happened to it. */
  markEvent: async (
    id: string,
    status: 'processed' | 'ignored' | 'failed',
    note?: string | null,
    userId?: string | null,
  ): Promise<void> => {
    const values: Record<string, unknown> = { status, note: note ? note.slice(0, 500) : null };
    if (userId !== undefined) values.userId = userId;
    await db.update(revenuecatEvents).set(values).where(eq(revenuecatEvents.id, id));
  },

  listEvents: async (opts: { limit?: number; userId?: string } = {}): Promise<RevenueCatEventRow[]> => {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const where = opts.userId ? eq(revenuecatEvents.userId, opts.userId) : undefined;
    return db
      .select()
      .from(revenuecatEvents)
      .where(where)
      .orderBy(desc(revenuecatEvents.createdAt))
      .limit(limit);
  },

  // ── Subscription state ─────────────────────────────────────────────────────
  /**
   * Write a resolved state onto the user's subscription row.
   *
   * Two things make this more than an update:
   *
   * 1. **Out-of-order delivery.** RevenueCat does not promise ordering, so a
   *    retried EXPIRATION can arrive after the RENEWAL that superseded it.
   *    Applying it would cancel a subscription the user has already paid to
   *    renew. Any state whose `eventAtMs` is older than what the row already
   *    reflects is therefore dropped, and the caller is told so.
   *
   * 2. **Manual grants.** A row an admin granted (`provider: 'manual'`) is not
   *    RevenueCat's to expire — RevenueCat has no record of it and would
   *    happily report the customer as unentitled. A store purchase still takes
   *    the row over, since that is the user paying for a real plan; only the
   *    revoking states leave a manual grant alone.
   *
   * The read is `SELECT … FOR UPDATE` so two deliveries for the same user
   * cannot both read the pre-update row and race.
   */
  applyState: async (
    userId: string,
    state: RevenueCatSubscriptionState,
  ): Promise<{ applied: boolean; reason?: string; subscription: SubscriptionRow | null }> =>
    db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(userSubscriptions)
        .where(eq(userSubscriptions.userId, userId))
        .orderBy(desc(userSubscriptions.updatedAt))
        .limit(1)
        .for('update');

      const grants = state.status === 'active';

      if (existing) {
        const seenMs = existing.lastEventAtMs === null ? null : Number(existing.lastEventAtMs);
        if (state.eventAtMs !== null && seenMs !== null && state.eventAtMs < seenMs) {
          return { applied: false, reason: 'stale event', subscription: existing };
        }
        if (existing.provider === 'manual' && !grants) {
          return { applied: false, reason: 'manual grant left in place', subscription: existing };
        }
      } else if (!grants) {
        // Nothing to revoke — an expiry for a user who never had a row here.
        return { applied: false, reason: 'no subscription to update', subscription: null };
      }

      const values = {
        planId: state.planId,
        status: state.status,
        provider: 'revenuecat',
        store: state.store,
        rcAppUserId: state.rcAppUserId,
        rcEntitlementId: state.rcEntitlementId,
        rcProductId: state.rcProductId,
        rcOriginalTransactionId: state.rcOriginalTransactionId,
        currentPeriodEnd: state.currentPeriodEnd,
        cancelAtPeriodEnd: state.cancelAtPeriodEnd,
        willRenew: state.willRenew,
        isTrial: state.isTrial,
        lastEventAtMs: state.eventAtMs === null ? null : String(state.eventAtMs),
        updatedAt: new Date(),
      };

      if (existing) {
        const [row] = await tx
          .update(userSubscriptions)
          .set({
            ...values,
            // The period start only moves forward, so a CANCELLATION that
            // carries no purchase date cannot blank out when the term began.
            ...(state.currentPeriodStart ? { currentPeriodStart: state.currentPeriodStart } : {}),
          })
          .where(eq(userSubscriptions.id, existing.id))
          .returning();
        return { applied: true, subscription: row };
      }

      const [row] = await tx
        .insert(userSubscriptions)
        .values({
          userId,
          ...values,
          ...(state.currentPeriodStart ? { currentPeriodStart: state.currentPeriodStart } : {}),
        })
        .returning();
      return { applied: true, subscription: row };
    }),

  /**
   * Move a purchase from one CareLeo user to another (TRANSFER events).
   *
   * The losing account keeps its row but stops being entitled: the purchase is
   * genuinely no longer theirs, and deleting the row would lose the history of
   * what they used to have.
   */
  revokeTransferredAway: async (fromUserId: string, rcAppUserId: string): Promise<void> => {
    await db
      .update(userSubscriptions)
      .set({ status: 'expired', willRenew: false, cancelAtPeriodEnd: true, updatedAt: new Date() })
      .where(
        and(
          eq(userSubscriptions.userId, fromUserId),
          eq(userSubscriptions.provider, 'revenuecat'),
          eq(userSubscriptions.rcAppUserId, rcAppUserId),
        ),
      );
  },

  /** Users whose RevenueCat period has lapsed without an EXPIRATION arriving. */
  findLapsed: async (limit = 200): Promise<SubscriptionRow[]> =>
    db
      .select()
      .from(userSubscriptions)
      .where(
        and(
          eq(userSubscriptions.provider, 'revenuecat'),
          eq(userSubscriptions.status, 'active'),
          sql`${userSubscriptions.currentPeriodEnd} is not null`,
          sql`${userSubscriptions.currentPeriodEnd} < now()`,
        ),
      )
      .limit(limit),
};
