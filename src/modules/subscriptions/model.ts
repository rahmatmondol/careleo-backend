import { and, eq } from 'drizzle-orm';
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

  createPlan: async (input: {
    name: string;
    description?: string | null;
    price?: string | number;
    billingCycle?: string;
    featureFlags?: FeatureFlags;
    limits?: PlanLimits;
    isActive?: boolean;
    sortOrder?: string | number;
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
  getActiveSubscription: async (userId: string): Promise<SubscriptionRow | undefined> => {
    const [row] = await db
      .select()
      .from(userSubscriptions)
      .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.status, 'active')));
    return row;
  },

  /** Upsert the user's subscription to a plan (one active subscription per user). */
  setSubscription: async (userId: string, planId: string): Promise<SubscriptionRow> => {
    const existing = await SubscriptionsModel.getActiveSubscription(userId);
    if (existing) {
      const [row] = await db
        .update(userSubscriptions)
        .set({ planId, status: 'active', updatedAt: new Date() })
        .where(eq(userSubscriptions.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await db
      .insert(userSubscriptions)
      .values({ userId, planId, status: 'active' })
      .returning();
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
