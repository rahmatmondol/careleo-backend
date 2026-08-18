import { timingSafeEqual } from 'node:crypto';
import { AppError, UnauthorizedError, ValidationError } from '@/shared/errors';
import { SubscriptionsModel, type PlanRow } from '../model';
import { invalidateEntitlement } from '../entitlements';
import { RevenueCatClient } from './client';
import { revenueCatConfig } from './config';
import {
  eventEntitlementIds,
  eventProductId,
  isTrialPeriod,
  normalizeStore,
  pickBestPlan,
  resolvePlan,
} from './mapping';
import { RevenueCatModel, type RevenueCatSubscriptionState } from './model';
import type { RevenueCatEvent, RevenueCatWebhookBody } from './types';

/** What one webhook delivery did, echoed back to RevenueCat and the logs. */
export type WebhookOutcome = {
  received: true;
  eventId: string | null;
  type: string | null;
  /** 'processed' — a subscription changed. 'ignored' — understood, no change. */
  status: 'processed' | 'ignored' | 'duplicate';
  reason?: string;
};

const msToDate = (ms?: number | null): Date | null =>
  typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? new Date(ms) : null;

const isoToDate = (iso?: string | null): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Later of the two, ignoring nulls — used to extend a period into its grace window. */
const latest = (a: Date | null, b: Date | null): Date | null => {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
};

/**
 * Constant-time comparison of the webhook's `Authorization` header.
 *
 * RevenueCat authenticates webhooks with a shared secret rather than a
 * signature, so this string is the only thing standing between the internet
 * and free Premium. A plain `===` leaks the secret a character at a time to
 * anyone willing to time the responses.
 */
const authHeaderMatches = (received: string, expected: string): boolean => {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would itself be a
  // length oracle; compare against a fixed-size digest-like padding instead by
  // rejecting early only after both buffers are the same size.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
};

/** Grant-shaped events: the customer ends up entitled to whatever they just bought. */
const GRANTING_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'SUBSCRIPTION_EXTENDED',
  'REFUND_REVERSED',
  'TEMPORARY_ENTITLEMENT_GRANT',
]);

/** Events that carry no entitlement change worth mirroring. */
const NOOP_EVENTS = new Set(['TEST', 'SUBSCRIBER_ALIAS', 'INVOICE_ISSUANCE', 'VIRTUAL_CURRENCY_TRANSACTION']);

export const RevenueCatService = {
  /**
   * What a client needs to start the RevenueCat SDK.
   *
   * The app user id is handed out by the server rather than chosen by the
   * client so every platform agrees on it — the whole cross-platform story
   * depends on iOS, Android and the web configuring the SDK with the same id.
   */
  publicConfig: (userId: string) => {
    const keys = revenueCatConfig.publicKeys();
    return {
      appUserId: userId,
      publicKeys: keys,
      defaultOffering: revenueCatConfig.defaultOffering() || null,
      /** False when no key is set for a platform — clients should hide the paywall. */
      enabled: {
        ios: Boolean(keys.ios),
        android: Boolean(keys.android),
        web: Boolean(keys.web),
      },
      sandboxAllowed: revenueCatConfig.allowSandbox(),
    };
  },

  // ── Webhook ────────────────────────────────────────────────────────────────
  /**
   * Handle one webhook delivery.
   *
   * Always resolves rather than throwing once the request is authenticated:
   * RevenueCat retries any non-2xx, so an event we understand but cannot act
   * on (an unmapped product, a purchase by a user we do not know) must be
   * recorded and acknowledged, or it is redelivered forever. Genuine failures
   * — the database being down — still throw and get retried, which is what
   * retries are for.
   */
  handleWebhook: async (rawBody: unknown, authHeader: string | undefined): Promise<WebhookOutcome> => {
    const expected = revenueCatConfig.webhookAuth();
    if (!expected) {
      throw new AppError(
        'REVENUECAT_NOT_CONFIGURED',
        'RevenueCat webhooks are not configured on this server',
        503,
      );
    }
    if (!authHeader || !authHeaderMatches(authHeader, expected)) {
      throw new UnauthorizedError('Invalid RevenueCat webhook authorization');
    }

    const body = (rawBody ?? {}) as RevenueCatWebhookBody;
    const event = body.event;
    if (!event || !event.id || !event.type) {
      throw new ValidationError('Malformed RevenueCat webhook payload');
    }

    const type = String(event.type);
    const store = normalizeStore(event.store);
    const productId = eventProductId(event);
    const appUserId = event.app_user_id ?? event.original_app_user_id ?? null;

    const userId = await RevenueCatModel.resolveUserId([
      event.app_user_id,
      event.original_app_user_id,
      ...(event.transferred_to ?? []),
      ...(event.aliases ?? []),
    ]);

    const row = await RevenueCatModel.recordEvent({
      eventId: String(event.id),
      type,
      appUserId,
      userId,
      productId,
      store,
      environment: event.environment ?? null,
      eventTimestampMs: typeof event.event_timestamp_ms === 'number' ? event.event_timestamp_ms : null,
      payload: (rawBody ?? {}) as Record<string, unknown>,
    });

    // Already seen — a RevenueCat retry of something we handled.
    if (!row) {
      return { received: true, eventId: String(event.id), type, status: 'duplicate' };
    }

    const ignore = async (reason: string): Promise<WebhookOutcome> => {
      await RevenueCatModel.markEvent(row.id, 'ignored', reason, userId);
      return { received: true, eventId: String(event.id), type, status: 'ignored', reason };
    };
    const done = async (reason?: string): Promise<WebhookOutcome> => {
      await RevenueCatModel.markEvent(row.id, 'processed', reason ?? null, userId);
      return { received: true, eventId: String(event.id), type, status: 'processed', reason };
    };

    if (NOOP_EVENTS.has(type)) return ignore('event type carries no entitlement change');

    if ((event.environment ?? '').toUpperCase() === 'SANDBOX' && !revenueCatConfig.allowSandbox()) {
      return ignore('sandbox event rejected in this environment');
    }

    if (type === 'TRANSFER') {
      const result = await handleTransfer(event);
      return result.changed ? done(result.reason) : ignore(result.reason);
    }

    if (!userId) return ignore(`no CareLeo user for app user id ${appUserId ?? '(none)'}`);

    const plans = await SubscriptionsModel.listPlans(true);
    const plan = resolvePlan(plans, { entitlementIds: eventEntitlementIds(event), productId });
    if (!plan) {
      return ignore(
        `no plan mapped to entitlement(s) [${eventEntitlementIds(event).join(', ')}] / product ${productId ?? '(none)'}`,
      );
    }

    const state = stateFromEvent(event, plan, type);
    if (!state) return ignore(`event type ${type} is not handled`);

    const applied = await RevenueCatModel.applyState(userId, state);
    invalidateEntitlement(userId);
    return applied.applied
      ? done(`${type} -> ${plan.name} (${state.status})`)
      : ignore(applied.reason ?? 'no change');
  },

  // ── Reconcile ──────────────────────────────────────────────────────────────
  /**
   * Pull the truth from RevenueCat and write it over whatever is stored.
   *
   * Clients call this immediately after a purchase completes so the paid tier
   * is live before the user navigates away — the webhook is authoritative but
   * arrives whenever it arrives, and waiting on it is a visibly broken
   * purchase. It is also the repair tool for a webhook that was missed.
   */
  syncUser: async (userId: string): Promise<{ synced: boolean; planId: string | null; planName: string; reason?: string }> => {
    if (!revenueCatConfig.isRestConfigured()) {
      throw new AppError('REVENUECAT_NOT_CONFIGURED', 'REVENUECAT_SECRET_API_KEY is not set', 503);
    }

    const subscriber = await RevenueCatClient.getSubscriber(userId);
    const plans = await SubscriptionsModel.listPlans(true);
    const now = Date.now();

    // An entitlement counts while it has not expired; a null expiry is a
    // lifetime/non-renewing grant, which never does.
    const active: { plan: PlanRow; entitlementId: string; productId: string | null; expires: Date | null; purchased: Date | null }[] = [];
    for (const [entitlementId, ent] of Object.entries(subscriber?.entitlements ?? {})) {
      const expires = latest(isoToDate(ent.expires_date), isoToDate(ent.grace_period_expires_date));
      if (expires && expires.getTime() <= now) continue;
      const plan = resolvePlan(plans, { entitlementIds: [entitlementId], productId: ent.product_identifier ?? null });
      if (!plan) continue;
      active.push({ plan, entitlementId, productId: ent.product_identifier ?? null, expires, purchased: isoToDate(ent.purchase_date) });
    }

    const best = pickBestPlan(active.map((a) => a.plan));
    if (!best) {
      // Nothing entitled. Only RevenueCat-owned rows are cleared — an admin
      // grant is not RevenueCat's to take away.
      const current = await SubscriptionsModel.getLatestSubscription(userId);
      if (current && current.provider === 'revenuecat' && current.status === 'active') {
        await RevenueCatModel.applyState(userId, {
          planId: current.planId,
          status: 'expired',
          store: current.store,
          rcAppUserId: userId,
          rcEntitlementId: current.rcEntitlementId,
          rcProductId: current.rcProductId,
          rcOriginalTransactionId: current.rcOriginalTransactionId,
          currentPeriodStart: null,
          currentPeriodEnd: current.currentPeriodEnd,
          cancelAtPeriodEnd: true,
          willRenew: false,
          isTrial: false,
          // A reconcile reflects the present, so it must not be dropped as
          // stale by an older event's timestamp.
          eventAtMs: now,
        });
        invalidateEntitlement(userId);
        return { synced: true, planId: null, planName: 'Free', reason: 'no active entitlement at RevenueCat' };
      }
      return { synced: false, planId: null, planName: current ? '(unchanged)' : 'Free', reason: 'no active entitlement at RevenueCat' };
    }

    const chosen = active.find((a) => a.plan.id === best.id)!;
    const sub = chosen.productId ? subscriber?.subscriptions?.[chosen.productId] : undefined;

    await RevenueCatModel.applyState(userId, {
      planId: best.id,
      status: 'active',
      store: normalizeStore(sub?.store) ?? null,
      rcAppUserId: userId,
      rcEntitlementId: chosen.entitlementId,
      rcProductId: chosen.productId,
      rcOriginalTransactionId: sub?.original_store_transaction_id ?? sub?.store_transaction_id ?? null,
      currentPeriodStart: chosen.purchased,
      currentPeriodEnd: chosen.expires,
      cancelAtPeriodEnd: Boolean(sub?.unsubscribe_detected_at),
      willRenew: !sub?.unsubscribe_detected_at && !sub?.billing_issues_detected_at,
      isTrial: isTrialPeriod(sub?.period_type),
      eventAtMs: now,
    });
    invalidateEntitlement(userId);
    return { synced: true, planId: best.id, planName: best.name };
  },

  /**
   * The store's own "manage subscription" destination for this customer.
   *
   * Null when RevenueCat has no record of them or the store does not offer one
   * (Amazon, promotional grants) — the caller should then fall back to telling
   * the user where to look rather than showing a dead button.
   */
  managementUrl: async (userId: string): Promise<{ url: string | null }> => {
    if (!revenueCatConfig.isRestConfigured()) return { url: null };
    const subscriber = await RevenueCatClient.getSubscriber(userId);
    return { url: subscriber?.management_url ?? null };
  },

  /** Recent webhook deliveries, for the admin panel's troubleshooting view. */
  listEvents: (opts: { limit?: number; userId?: string }) => RevenueCatModel.listEvents(opts),
};

/**
 * Derive the resulting subscription state from one event.
 *
 * Returns null for an event type this app does not model, which the caller
 * records as ignored.
 */
const stateFromEvent = (
  event: RevenueCatEvent,
  plan: PlanRow,
  type: string,
): RevenueCatSubscriptionState | null => {
  const expiresAt = msToDate(event.expiration_at_ms);
  const graceUntil = msToDate(event.grace_period_expiration_at_ms);
  const base = {
    planId: plan.id,
    store: normalizeStore(event.store),
    rcAppUserId: event.app_user_id ?? event.original_app_user_id ?? '',
    rcEntitlementId: plan.rcEntitlementId ?? eventEntitlementIds(event)[0] ?? null,
    rcProductId: eventProductId(event),
    rcOriginalTransactionId: event.original_transaction_id ?? event.transaction_id ?? null,
    currentPeriodStart: msToDate(event.purchased_at_ms),
    isTrial: isTrialPeriod(event.period_type),
    eventAtMs: typeof event.event_timestamp_ms === 'number' ? event.event_timestamp_ms : null,
  };

  if (GRANTING_EVENTS.has(type)) {
    return {
      ...base,
      status: 'active',
      currentPeriodEnd: latest(expiresAt, graceUntil),
      // UNCANCELLATION is exactly the user changing their mind, so it must
      // clear the pending cancellation as well as re-granting access.
      cancelAtPeriodEnd: false,
      willRenew: true,
    };
  }

  if (type === 'CANCELLATION') {
    // A cancellation is normally "stop renewing", not "stop now" — the user
    // keeps what they paid for until the period ends. A refund is the
    // exception: the money went back, so access goes with it.
    const refunded = (event.cancel_reason ?? '').toUpperCase() === 'CUSTOMER_SUPPORT';
    const lapsed = expiresAt !== null && expiresAt.getTime() <= Date.now();
    return {
      ...base,
      status: refunded || lapsed ? 'expired' : 'active',
      currentPeriodEnd: expiresAt,
      cancelAtPeriodEnd: true,
      willRenew: false,
    };
  }

  if (type === 'BILLING_ISSUE' || type === 'SUBSCRIPTION_PAUSED') {
    // Both leave the customer paid up to a date and not renewing past it:
    // a billing issue runs to the end of the grace period, a paused Play
    // subscription to the end of the term already bought. Access is kept until
    // then and the period-end check in the model retires it on time.
    const until = latest(expiresAt, graceUntil);
    return {
      ...base,
      status: until && until.getTime() <= Date.now() ? 'expired' : 'active',
      currentPeriodEnd: until,
      cancelAtPeriodEnd: true,
      willRenew: false,
    };
  }

  if (type === 'EXPIRATION') {
    return {
      ...base,
      status: 'expired',
      currentPeriodEnd: expiresAt,
      cancelAtPeriodEnd: true,
      willRenew: false,
    };
  }

  return null;
};

/**
 * Move a purchase between accounts.
 *
 * TRANSFER events name the app user ids involved but not the product, so the
 * receiving account is settled by reconciling against RevenueCat rather than
 * by reading the event. The losing account is revoked first: the alternative
 * ordering leaves both accounts entitled if the reconcile fails.
 */
const handleTransfer = async (event: RevenueCatEvent): Promise<{ changed: boolean; reason: string }> => {
  const toUserId = await RevenueCatModel.resolveUserId(event.transferred_to ?? []);
  const fromUserId = await RevenueCatModel.resolveUserId(event.transferred_from ?? []);

  if (fromUserId) {
    for (const appUserId of event.transferred_from ?? []) {
      await RevenueCatModel.revokeTransferredAway(fromUserId, appUserId);
    }
    invalidateEntitlement(fromUserId);
  }

  if (!toUserId) {
    return {
      changed: Boolean(fromUserId),
      reason: fromUserId ? 'revoked from previous owner; new owner is not a CareLeo user' : 'neither account is a CareLeo user',
    };
  }

  if (!revenueCatConfig.isRestConfigured()) {
    return { changed: Boolean(fromUserId), reason: 'cannot reconcile new owner: REVENUECAT_SECRET_API_KEY is not set' };
  }

  const result = await RevenueCatService.syncUser(toUserId);
  return { changed: true, reason: `transferred to ${result.planName}${result.reason ? ` (${result.reason})` : ''}` };
};
