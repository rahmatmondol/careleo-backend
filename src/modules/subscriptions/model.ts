import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';
import { db } from '@/shared/db';
import {
  categories,
  planCoverageRules,
  products,
  subscriptionPlans,
  userSubscriptions,
} from '@/shared/db/schema';
import type { FeatureFlags, PlanLimits } from './catalog';

export type PlanRow = typeof subscriptionPlans.$inferSelect;
export type SubscriptionRow = typeof userSubscriptions.$inferSelect;

/** DB access for subscription plans and user subscriptions. */
export const SubscriptionsModel = {
  // ── Plans ────────────────────────────────────────────────────────────────
  listPlans: async (includeInactive = false): Promise<PlanRow[]> => {
    const rows = await db.select().from(subscriptionPlans);
    const filtered = includeInactive ? rows : rows.filter((p) => p.isActive);
    return filtered.sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
  },

  getPlan: async (id: string): Promise<PlanRow | undefined> => {
    const [row] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id));
    return row;
  },

  getPlanByName: async (name: string): Promise<PlanRow | undefined> => {
    const [row] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.name, name));
    return row;
  },

  /** Every plan that maps to a RevenueCat entitlement or store product. */
  listRevenueCatMappedPlans: async (): Promise<PlanRow[]> => {
    const rows = await db.select().from(subscriptionPlans);
    return rows.filter(
      (p) => p.rcEntitlementId || p.rcProductIdIos || p.rcProductIdAndroid || p.rcProductIdWeb,
    );
  },

  /** The plan (if any) already claiming a RevenueCat entitlement id. */
  getPlanByRcEntitlement: async (entitlementId: string): Promise<PlanRow | undefined> => {
    const [row] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.rcEntitlementId, entitlementId));
    return row;
  },

  createPlan: async (input: {
    name: string;
    description?: string | null;
    price?: string | number;
    billingCycle?: string;
    featureFlags?: FeatureFlags;
    limits?: PlanLimits;
    isActive?: boolean;
    sortOrder?: string | number;
    rcEntitlementId?: string | null;
    rcProductIdIos?: string | null;
    rcProductIdAndroid?: string | null;
    rcProductIdWeb?: string | null;
  }): Promise<PlanRow> => {
    const [row] = await db
      .insert(subscriptionPlans)
      .values({
        name: input.name,
        description: input.description ?? null,
        price: input.price !== undefined ? String(input.price) : undefined,
        billingCycle: input.billingCycle,
        featureFlags: input.featureFlags ?? {},
        limits: input.limits ?? {},
        isActive: input.isActive,
        sortOrder: input.sortOrder !== undefined ? String(input.sortOrder) : undefined,
        rcEntitlementId: input.rcEntitlementId ?? null,
        rcProductIdIos: input.rcProductIdIos ?? null,
        rcProductIdAndroid: input.rcProductIdAndroid ?? null,
        rcProductIdWeb: input.rcProductIdWeb ?? null,
      })
      .returning();
    return row;
  },

  updatePlan: async (
    id: string,
    patch: Partial<{
      name: string;
      description: string | null;
      price: string | number;
      billingCycle: string;
      featureFlags: FeatureFlags;
      limits: PlanLimits;
      isActive: boolean;
      sortOrder: string | number;
      rcEntitlementId: string | null;
      rcProductIdIos: string | null;
      rcProductIdAndroid: string | null;
      rcProductIdWeb: string | null;
    }>,
  ): Promise<PlanRow | undefined> => {
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.description !== undefined) values.description = patch.description;
    if (patch.price !== undefined) values.price = String(patch.price);
    if (patch.billingCycle !== undefined) values.billingCycle = patch.billingCycle;
    if (patch.featureFlags !== undefined) values.featureFlags = patch.featureFlags;
    if (patch.limits !== undefined) values.limits = patch.limits;
    if (patch.isActive !== undefined) values.isActive = patch.isActive;
    if (patch.sortOrder !== undefined) values.sortOrder = String(patch.sortOrder);
    if (patch.rcEntitlementId !== undefined) values.rcEntitlementId = patch.rcEntitlementId;
    if (patch.rcProductIdIos !== undefined) values.rcProductIdIos = patch.rcProductIdIos;
    if (patch.rcProductIdAndroid !== undefined) values.rcProductIdAndroid = patch.rcProductIdAndroid;
    if (patch.rcProductIdWeb !== undefined) values.rcProductIdWeb = patch.rcProductIdWeb;
    const [row] = await db
      .update(subscriptionPlans)
      .set(values)
      .where(eq(subscriptionPlans.id, id))
      .returning();
    return row;
  },

  deletePlan: async (id: string): Promise<void> => {
    await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, id));
  },

  // ── User subscriptions ─────────────────────────────────────────────────────
  /**
   * The subscription whose entitlements apply right now.
   *
   * The period end is checked here, not just the status, because a store-billed
   * subscription stops being paid for at a moment RevenueCat tells us about
   * afterwards: if the EXPIRATION webhook is delayed, retried or dropped, the
   * row still says 'active'. Treating a lapsed period as no subscription means
   * the worst a missed webhook can do is end access on time. Manually granted
   * rows leave `currentPeriodEnd` null and so never lapse.
   */
  getActiveSubscription: async (userId: string): Promise<SubscriptionRow | undefined> => {
    const [row] = await db
      .select()
      .from(userSubscriptions)
      .where(
        and(
          eq(userSubscriptions.userId, userId),
          eq(userSubscriptions.status, 'active'),
          or(isNull(userSubscriptions.currentPeriodEnd), gt(userSubscriptions.currentPeriodEnd, new Date())),
        ),
      )
      .orderBy(desc(userSubscriptions.updatedAt));
    return row;
  },

  /** The user's subscription row whatever its state — what a status change updates. */
  getLatestSubscription: async (userId: string): Promise<SubscriptionRow | undefined> => {
    const [row] = await db
      .select()
      .from(userSubscriptions)
      .where(eq(userSubscriptions.userId, userId))
      .orderBy(desc(userSubscriptions.updatedAt));
    return row;
  },

  /**
   * Upsert the user's subscription to a plan (one active subscription per user).
   *
   * This is the *manual* path — an admin grant or the legacy /subscribe route.
   * It writes `provider: 'manual'` and clears the RevenueCat provenance, so a
   * row a human granted is never mistaken for one the webhook owns.
   */
  setSubscription: async (userId: string, planId: string): Promise<SubscriptionRow> => {
    const existing = await SubscriptionsModel.getLatestSubscription(userId);
    const manual = {
      planId,
      status: 'active' as const,
      provider: 'manual',
      store: null,
      rcAppUserId: null,
      rcEntitlementId: null,
      rcProductId: null,
      rcOriginalTransactionId: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      willRenew: true,
      isTrial: false,
      lastEventAtMs: null,
    };
    if (existing) {
      const [row] = await db
        .update(userSubscriptions)
        .set({ ...manual, updatedAt: new Date() })
        .where(eq(userSubscriptions.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await db.insert(userSubscriptions).values({ userId, ...manual }).returning();
    return row;
  },

  // ── Coverage rules (what the plan's food budget may be spent on) ───────────

  /**
   * Rules for a plan, with the category/product name resolved so the Plan
   * Builder can list them without a second round of lookups. A rule whose
   * target has since been deleted still comes back, labelled — otherwise it
   * would be invisible in the UI and impossible to clean up.
   */
  listCoverageRules: async (planId: string) => {
    const rows = await db
      .select({
        id: planCoverageRules.id,
        planId: planCoverageRules.planId,
        scope: planCoverageRules.scope,
        refId: planCoverageRules.refId,
        monthlyQtyLimit: planCoverageRules.monthlyQtyLimit,
        categoryName: categories.name,
        productName: products.name,
      })
      .from(planCoverageRules)
      .leftJoin(categories, eq(planCoverageRules.refId, categories.id))
      .leftJoin(products, eq(planCoverageRules.refId, products.id))
      .where(eq(planCoverageRules.planId, planId));

    return rows.map((r) => ({
      id: r.id,
      planId: r.planId,
      scope: r.scope,
      refId: r.refId,
      monthlyQtyLimit: r.monthlyQtyLimit === null ? null : Number(r.monthlyQtyLimit),
      label: (r.scope === 'product' ? r.productName : r.categoryName) ?? '(deleted)',
    }));
  },

  /** Replace a plan's whole rule set — the Plan Builder edits it as one list. */
  replaceCoverageRules: async (
    planId: string,
    rules: { scope: string; refId: string; monthlyQtyLimit: number | null }[],
  ) => {
    await db.transaction(async (tx) => {
      await tx.delete(planCoverageRules).where(eq(planCoverageRules.planId, planId));
      if (!rules.length) return;
      await tx.insert(planCoverageRules).values(
        rules.map((r) => ({
          planId,
          scope: r.scope,
          refId: r.refId,
          monthlyQtyLimit: r.monthlyQtyLimit === null ? null : String(r.monthlyQtyLimit),
        })),
      );
    });
    return SubscriptionsModel.listCoverageRules(planId);
  },
};
