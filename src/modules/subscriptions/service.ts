import { NotFoundError, ValidationError } from '@/shared/errors';
import {
  FEATURE_KEYS,
  LIMIT_KEYS,
  FEATURE_CATALOG,
  LIMIT_CATALOG,
  type FeatureFlags,
  type FeatureKey,
  type LimitKey,
  type PlanLimits,
} from './catalog';
import { SubscriptionsModel, type PlanRow } from './model';
import { invalidateEntitlement, resolveEntitlement } from './entitlements';

const FEATURE_SET = new Set<string>(FEATURE_KEYS);
const LIMIT_SET = new Set<string>(LIMIT_KEYS);

/** The plan fields that map a plan onto what RevenueCat actually sells. */
const RC_ID_FIELDS = ['rcEntitlementId', 'rcProductIdIos', 'rcProductIdAndroid', 'rcProductIdWeb'] as const;
type RcIdField = (typeof RC_ID_FIELDS)[number];

/**
 * Store identifiers are opaque strings, so the only validation possible is
 * shape: trim it, treat blank as "not mapped", and refuse anything longer than
 * the column. Sending an over-long id would otherwise fail as a database
 * error the admin cannot interpret.
 */
const sanitizeRcId = (value: unknown, field: string): string | null => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (trimmed.length > 190) throw new ValidationError(`${field} must be 190 characters or fewer`);
  return trimmed;
};

/** Copy whichever RevenueCat ids the request actually sent onto a patch. */
const applyRcIds = (body: Record<string, unknown>, target: Record<string, unknown>): void => {
  for (const field of RC_ID_FIELDS) {
    if (body[field] !== undefined) target[field] = sanitizeRcId(body[field], field);
  }
};

/**
 * One entitlement id may only belong to one plan.
 *
 * Two plans claiming "premium" would make the webhook's plan lookup depend on
 * row order — the user's tier would then be whichever plan Postgres happened
 * to return first. Rejecting the clash here keeps that impossible.
 */
const assertRcEntitlementFree = async (entitlementId: string | null, selfId?: string): Promise<void> => {
  if (!entitlementId) return;
  const clash = await SubscriptionsModel.getPlanByRcEntitlement(entitlementId);
  if (clash && clash.id !== selfId) {
    throw new ValidationError(`Plan "${clash.name}" already maps to RevenueCat entitlement "${entitlementId}"`);
  }
};

/** Keep only recognised feature keys with boolean values. */
const sanitizeFeatureFlags = (input: unknown): FeatureFlags => {
  if (!input || typeof input !== 'object') return {};
  const out: FeatureFlags = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (FEATURE_SET.has(k)) out[k as FeatureKey] = Boolean(v);
  }
  return out;
};

/** Keep only recognised limit keys; coerce to number or null (unlimited). */
const sanitizeLimits = (input: unknown): PlanLimits => {
  if (!input || typeof input !== 'object') return {};
  const out: PlanLimits = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!LIMIT_SET.has(k)) continue;
    if (v === null || v === '' || v === undefined) {
      out[k as LimitKey] = null;
    } else {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) throw new ValidationError(`Invalid limit value for "${k}"`);
      out[k as LimitKey] = n;
    }
  }
  return out;
};

export const SubscriptionsService = {
  /** Catalog metadata so the admin Plan Builder can render its checklist + inputs. */
  catalog: () => ({ features: FEATURE_CATALOG, limits: LIMIT_CATALOG }),

  // ── Admin: plan management ─────────────────────────────────────────────────
  listPlans: (includeInactive = false) => SubscriptionsModel.listPlans(includeInactive),

  getPlan: async (id: string): Promise<PlanRow> => {
    const plan = await SubscriptionsModel.getPlan(id);
    if (!plan) throw new NotFoundError('Subscription plan not found');
    return plan;
  },

  createPlan: async (body: Record<string, unknown>) => {
    const name = String(body.name ?? '').trim();
    if (!name) throw new ValidationError('Plan name is required');
    if (await SubscriptionsModel.getPlanByName(name)) {
      throw new ValidationError(`A plan named "${name}" already exists`);
    }
    const rcIds: Record<string, unknown> = {};
    applyRcIds(body, rcIds);
    await assertRcEntitlementFree((rcIds.rcEntitlementId as string | null) ?? null);

    return SubscriptionsModel.createPlan({
      name,
      description: body.description != null ? String(body.description) : null,
      price: body.price != null ? Number(body.price) : 0,
      billingCycle: body.billingCycle ? String(body.billingCycle) : undefined,
      featureFlags: sanitizeFeatureFlags(body.featureFlags),
      limits: sanitizeLimits(body.limits),
      isActive: body.isActive != null ? Boolean(body.isActive) : undefined,
      sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
      ...(rcIds as Partial<Record<RcIdField, string | null>>),
    });
  },

  updatePlan: async (id: string, body: Record<string, unknown>) => {
    await SubscriptionsService.getPlan(id); // 404 if missing
    if (body.name != null) {
      const name = String(body.name).trim();
      const clash = await SubscriptionsModel.getPlanByName(name);
      if (clash && clash.id !== id) throw new ValidationError(`A plan named "${name}" already exists`);
    }
    const patch: Record<string, unknown> = {};
    if (body.name != null) patch.name = String(body.name).trim();
    if (body.description !== undefined) patch.description = body.description != null ? String(body.description) : null;
    if (body.price != null) patch.price = Number(body.price);
    if (body.billingCycle != null) patch.billingCycle = String(body.billingCycle);
    if (body.featureFlags !== undefined) patch.featureFlags = sanitizeFeatureFlags(body.featureFlags);
    if (body.limits !== undefined) patch.limits = sanitizeLimits(body.limits);
    if (body.isActive != null) patch.isActive = Boolean(body.isActive);
    if (body.sortOrder != null) patch.sortOrder = Number(body.sortOrder);
    applyRcIds(body, patch);
    if (patch.rcEntitlementId !== undefined) {
      await assertRcEntitlementFree(patch.rcEntitlementId as string | null, id);
    }
    return SubscriptionsModel.updatePlan(id, patch);
  },

  deletePlan: async (id: string) => {
    await SubscriptionsService.getPlan(id);
    await SubscriptionsModel.deletePlan(id);
    return { deleted: true };
  },

  // ── Coverage rules ─────────────────────────────────────────────────────────

  planCoverage: async (planId: string) => {
    await SubscriptionsService.getPlan(planId); // 404 if missing
    return { rules: await SubscriptionsModel.listCoverageRules(planId) };
  },

  /**
   * Replace a plan's coverage rules.
   *
   * Sent as the complete list because the Plan Builder edits it as one list;
   * per-rule PATCH would need the UI to track adds and deletes separately for
   * no benefit.
   */
  setPlanCoverage: async (planId: string, body: Record<string, unknown>) => {
    await SubscriptionsService.getPlan(planId);

    const input = Array.isArray(body.rules) ? body.rules : [];
    const seen = new Set<string>();
    const rules = input.map((raw) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      const scope = String(r.scope ?? '').trim();
      if (scope !== 'category' && scope !== 'product') {
        throw new ValidationError('Coverage scope must be "category" or "product"');
      }
      const refId = String(r.refId ?? '').trim();
      if (!refId) throw new ValidationError('Each coverage rule needs a refId');

      // The table has a unique index on (plan, scope, ref); reject duplicates
      // here so the admin gets a readable message instead of a constraint error.
      const key = `${scope}:${refId}`;
      if (seen.has(key)) throw new ValidationError('Duplicate coverage rule for the same item');
      seen.add(key);

      let monthlyQtyLimit: number | null = null;
      if (r.monthlyQtyLimit !== null && r.monthlyQtyLimit !== undefined && r.monthlyQtyLimit !== '') {
        const n = Number(r.monthlyQtyLimit);
        if (!Number.isFinite(n) || n < 0) throw new ValidationError('Monthly quantity limit must be 0 or more');
        monthlyQtyLimit = Math.floor(n);
      }

      return { scope, refId, monthlyQtyLimit };
    });

    const saved = await SubscriptionsModel.replaceCoverageRules(planId, rules);
    return { rules: saved };
  },

  // ── User-facing ────────────────────────────────────────────────────────────
  /** The caller's current subscription resolved into a usable entitlement. */
  mySubscription: async (userId: string) => {
    const entitlement = await resolveEntitlement(userId);
    const sub = await SubscriptionsModel.getActiveSubscription(userId);
    return { subscription: sub ?? null, entitlement };
  },

  /** Subscribe the caller to an active plan. */
  subscribe: async (userId: string, planId: string) => {
    if (!planId) throw new ValidationError('planId is required');
    const plan = await SubscriptionsModel.getPlan(planId);
    if (!plan || !plan.isActive) throw new NotFoundError('Active plan not found');
    const sub = await SubscriptionsModel.setSubscription(userId, planId);
    invalidateEntitlement(userId);
    return sub;
  },
};
