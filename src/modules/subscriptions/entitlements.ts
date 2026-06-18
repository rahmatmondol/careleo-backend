import { SubscriptionsModel } from './model';
import {
  FREE_FALLBACK,
  type FeatureFlags,
  type FeatureKey,
  type LimitKey,
  type PlanLimits,
} from './catalog';

/**
 * Resolved entitlement for a user — the merged feature flags + limits that
 * apply right now. This is the single thing gating code should consult.
 */
export type Entitlement = {
  planId: string | null;
  planName: string;
  featureFlags: FeatureFlags;
  limits: PlanLimits;
};

// Short-lived cache: plan resolution is hit on every AI tool dispatch and
// feature gate. TTL keeps admin plan edits visible within a few seconds.
const CACHE_TTL_MS = 15_000;
const cache = new Map<string, { value: Entitlement; expires: number }>();

const freeEntitlement = (): Entitlement => ({
  planId: null,
  planName: FREE_FALLBACK.name,
  featureFlags: FREE_FALLBACK.featureFlags,
  limits: FREE_FALLBACK.limits,
});

/**
 * Resolve a user's current entitlement. Falls back to the Free tier defaults
 * when the user has no active subscription or the plan was deleted/inactive.
 */
export const resolveEntitlement = async (userId: string, now = nowMs()): Promise<Entitlement> => {
  const cached = cache.get(userId);
  if (cached && cached.expires > now) return cached.value;

  let value: Entitlement;
  const sub = await SubscriptionsModel.getActiveSubscription(userId);
  if (!sub) {
    value = freeEntitlement();
  } else {
    const plan = await SubscriptionsModel.getPlan(sub.planId);
    value = plan && plan.isActive
      ? {
          planId: plan.id,
          planName: plan.name,
          featureFlags: plan.featureFlags ?? {},
          limits: plan.limits ?? {},
        }
      : freeEntitlement();
  }

  cache.set(userId, { value, expires: now + CACHE_TTL_MS });
  return value;
};

/** Drop a user's cached entitlement (call after changing their subscription). */
export const invalidateEntitlement = (userId: string): void => {
  cache.delete(userId);
};

/** Whether the user's current plan grants a feature. */
export const can = async (userId: string, feature: FeatureKey): Promise<boolean> => {
  const ent = await resolveEntitlement(userId);
  return ent.featureFlags[feature] === true;
};

/**
 * Numeric limit for the user's current plan. Returns `null` when the plan sets
 * the limit to unlimited or does not define it — callers treat null as "no cap".
 */
export const getLimit = async (userId: string, key: LimitKey): Promise<number | null> => {
  const ent = await resolveEntitlement(userId);
  const v = ent.limits[key];
  return v === undefined ? null : v;
};

// new Date()/Date.now() are fine in app code (only workflow scripts forbid them).
function nowMs(): number {
  return Date.now();
}
