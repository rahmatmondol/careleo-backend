import type { PlanRow } from '../model';
import type { RevenueCatEvent } from './types';

/**
 * Translating RevenueCat's vocabulary into CareLeo plans.
 *
 * RevenueCat talks in *entitlements* ("premium") and *store products*
 * ("careleo_premium_monthly"); this app talks in plans. The mapping lives on
 * the plan row (see subscriptions.schema.ts) so adding an annual SKU or a new
 * tier is an admin edit rather than a deploy.
 */

/** Stores report in upper snake case over webhooks and lower over REST. */
export const normalizeStore = (store?: string | null): string | null =>
  store ? store.toLowerCase() : null;

/** Every entitlement id an event refers to, old and new field alike. */
export const eventEntitlementIds = (event: RevenueCatEvent): string[] => {
  const ids = new Set<string>();
  for (const id of event.entitlement_ids ?? []) if (id) ids.add(id);
  if (event.entitlement_id) ids.add(event.entitlement_id);
  return [...ids];
};

/**
 * The product the event leaves the customer on.
 *
 * PRODUCT_CHANGE carries the *old* product in `product_id` and the one being
 * switched to in `new_product_id`; every other event only sets `product_id`.
 * Reading them in this order is what makes an upgrade land on the new tier
 * instead of re-applying the tier the user just left.
 */
export const eventProductId = (event: RevenueCatEvent): string | null =>
  event.new_product_id || event.product_id || null;

const productIdsOf = (plan: PlanRow): string[] =>
  [plan.rcProductIdIos, plan.rcProductIdAndroid, plan.rcProductIdWeb].filter(
    (v): v is string => Boolean(v),
  );

/**
 * Which plan a purchase grants.
 *
 * Entitlement wins over product because it is the stable identifier: the store
 * products behind "premium" change with every price rise, annual variant and
 * grandfathered SKU, while the entitlement id stays put. Product matching is
 * the fallback for events that name a product but carry no entitlement (a
 * misconfigured RevenueCat offering, and every NON_RENEWING_PURCHASE).
 *
 * Returns null when nothing matches — the caller records the event as ignored
 * rather than guessing, because guessing here means giving away a paid tier.
 */
export const resolvePlan = (
  plans: PlanRow[],
  input: { entitlementIds?: string[]; productId?: string | null },
): PlanRow | null => {
  const entitlementIds = input.entitlementIds ?? [];

  for (const entitlementId of entitlementIds) {
    const match = plans.find((p) => p.rcEntitlementId && p.rcEntitlementId === entitlementId);
    if (match) return match;
  }

  const productId = input.productId;
  if (productId) {
    const match = plans.find((p) => productIdsOf(p).includes(productId));
    if (match) return match;

    // Play Store subscription products are reported as `sku:base_plan`, but an
    // admin who copied the id out of the Play Console will usually have saved
    // the bare sku. Compare on the sku half before giving up.
    const [sku] = productId.split(':');
    if (sku && sku !== productId) {
      const skuMatch = plans.find((p) => productIdsOf(p).some((id) => id.split(':')[0] === sku));
      if (skuMatch) return skuMatch;
    }
  }

  return null;
};

/**
 * Pick one plan when a customer holds several entitlements at once.
 *
 * This happens legitimately — someone on monthly Premium who also redeems a
 * promotional Standard grant — and the customer should keep whichever is worth
 * more. Price decides, with sort order as the tie-break so two same-priced
 * plans still resolve deterministically.
 */
export const pickBestPlan = (plans: PlanRow[]): PlanRow | null => {
  if (!plans.length) return null;
  return [...plans].sort((a, b) => {
    const byPrice = Number(b.price ?? 0) - Number(a.price ?? 0);
    if (byPrice !== 0) return byPrice;
    return Number(b.sortOrder ?? 0) - Number(a.sortOrder ?? 0);
  })[0];
};

/** RevenueCat sends `TRIAL`/`INTRO` over webhooks and `trial`/`intro` over REST. */
export const isTrialPeriod = (periodType?: string | null): boolean => {
  const t = (periodType ?? '').toUpperCase();
  return t === 'TRIAL' || t === 'INTRO';
};
