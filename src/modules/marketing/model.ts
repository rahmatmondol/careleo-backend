import { and, count, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import {
  abandonedCartEvents,
  abandonedCartRules,
  couponRedemptions,
  coupons,
  orders,
} from '@/shared/db/schema';

export type CouponRow = typeof coupons.$inferSelect;
export type AbandonedCartRuleRow = typeof abandonedCartRules.$inferSelect;

/** Per-rule performance, derived from events rather than stored on the rule. */
export type RulePerformance = {
  sentCount: number;
  recoveredCount: number;
  recoveredRevenue: number;
};

export const MarketingModel = {
  // ── Coupons ────────────────────────────────────────────────────────────────
  listCoupons: async (): Promise<CouponRow[]> =>
    db.select().from(coupons).orderBy(desc(coupons.createdAt)),

  getCoupon: async (id: string): Promise<CouponRow | undefined> => {
    const [row] = await db.select().from(coupons).where(eq(coupons.id, id));
    return row;
  },

  /** Codes are stored upper-cased, so lookup upper-cases too. */
  getCouponByCode: async (code: string): Promise<CouponRow | undefined> => {
    const [row] = await db.select().from(coupons).where(eq(coupons.code, code.trim().toUpperCase()));
    return row;
  },

  createCoupon: async (input: Record<string, unknown>): Promise<CouponRow> => {
    const [row] = await db.insert(coupons).values(input as never).returning();
    return row;
  },

  updateCoupon: async (id: string, patch: Record<string, unknown>): Promise<CouponRow | undefined> => {
    const [row] = await db
      .update(coupons)
      .set({ ...patch, updatedAt: new Date() } as never)
      .where(eq(coupons.id, id))
      .returning();
    return row;
  },

  deleteCoupon: async (id: string): Promise<void> => {
    await db.delete(coupons).where(eq(coupons.id, id));
  },

  /** How many times one user has already redeemed a code (for the per-user cap). */
  countUserRedemptions: async (couponId: string, userId: string): Promise<number> => {
    const [row] = await db
      .select({ n: count() })
      .from(couponRedemptions)
      .where(and(eq(couponRedemptions.couponId, couponId), eq(couponRedemptions.userId, userId)));
    return Number(row?.n ?? 0);
  },

  // ── Abandoned-cart rules ───────────────────────────────────────────────────
  listRules: async (): Promise<AbandonedCartRuleRow[]> =>
    db.select().from(abandonedCartRules).orderBy(desc(abandonedCartRules.createdAt)),

  getRule: async (id: string): Promise<AbandonedCartRuleRow | undefined> => {
    const [row] = await db.select().from(abandonedCartRules).where(eq(abandonedCartRules.id, id));
    return row;
  },

  createRule: async (input: Record<string, unknown>): Promise<AbandonedCartRuleRow> => {
    const [row] = await db.insert(abandonedCartRules).values(input as never).returning();
    return row;
  },

  updateRule: async (
    id: string,
    patch: Record<string, unknown>,
  ): Promise<AbandonedCartRuleRow | undefined> => {
    const [row] = await db
      .update(abandonedCartRules)
      .set({ ...patch, updatedAt: new Date() } as never)
      .where(eq(abandonedCartRules.id, id))
      .returning();
    return row;
  },

  deleteRule: async (id: string): Promise<void> => {
    await db.delete(abandonedCartRules).where(eq(abandonedCartRules.id, id));
  },

  /**
   * Send/recovery totals per rule, as one grouped query rather than one query
   * per rule — the rules list renders every rule's stats at once.
   */
  rulePerformance: async (): Promise<Map<string, RulePerformance>> => {
    const rows = await db
      .select({
        ruleId: abandonedCartEvents.ruleId,
        sentCount: count(),
        recoveredCount: sql<number>`count(${abandonedCartEvents.recoveredOrderId})`,
        recoveredRevenue: sql<string>`coalesce(sum(${abandonedCartEvents.recoveredAmount}), 0)`,
      })
      .from(abandonedCartEvents)
      .groupBy(abandonedCartEvents.ruleId);

    return new Map(
      rows.map((r) => [
        r.ruleId,
        {
          sentCount: Number(r.sentCount ?? 0),
          recoveredCount: Number(r.recoveredCount ?? 0),
          recoveredRevenue: Number(r.recoveredRevenue ?? 0),
        },
      ]),
    );
  },

  // ── Analytics ──────────────────────────────────────────────────────────────
  couponTotals: async (): Promise<{ used: number; discount: number; attributedRevenue: number }> => {
    const [row] = await db
      .select({
        used: count(),
        discount: sql<string>`coalesce(sum(${couponRedemptions.discountAmount}), 0)`,
        attributedRevenue: sql<string>`coalesce(sum(${couponRedemptions.orderAmount}), 0)`,
      })
      .from(couponRedemptions);
    return {
      used: Number(row?.used ?? 0),
      discount: Number(row?.discount ?? 0),
      attributedRevenue: Number(row?.attributedRevenue ?? 0),
    };
  },

  cartRecoveryTotals: async (): Promise<{ abandoned: number; recovered: number; revenue: number }> => {
    const [row] = await db
      .select({
        abandoned: count(),
        recovered: sql<number>`count(${abandonedCartEvents.recoveredOrderId})`,
        revenue: sql<string>`coalesce(sum(${abandonedCartEvents.recoveredAmount}), 0)`,
      })
      .from(abandonedCartEvents);
    return {
      abandoned: Number(row?.abandoned ?? 0),
      recovered: Number(row?.recovered ?? 0),
      revenue: Number(row?.revenue ?? 0),
    };
  },

  countActiveRules: async (): Promise<number> => {
    const [row] = await db
      .select({ n: count() })
      .from(abandonedCartRules)
      .where(eq(abandonedCartRules.isActive, true));
    return Number(row?.n ?? 0);
  },

  /**
   * Month-by-month discount given, revenue on discounted orders, and revenue
   * recovered from abandoned carts, for the last `months` months.
   *
   * Three separate aggregates merged in JS rather than one join: joining
   * redemptions to recovery events would multiply rows wherever a month has
   * both, silently inflating every figure.
   */
  monthlyImpact: async (
    months = 6,
  ): Promise<{ month: string; couponDiscount: number; generatedRevenue: number; recoveredRevenue: number }[]> => {
    const since = new Date();
    since.setMonth(since.getMonth() - (months - 1));
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const couponRows = await db
      .select({
        month: sql<string>`to_char(${couponRedemptions.redeemedAt}, 'YYYY-MM')`,
        discount: sql<string>`coalesce(sum(${couponRedemptions.discountAmount}), 0)`,
        revenue: sql<string>`coalesce(sum(${couponRedemptions.orderAmount}), 0)`,
      })
      .from(couponRedemptions)
      .where(gte(couponRedemptions.redeemedAt, since))
      .groupBy(sql`to_char(${couponRedemptions.redeemedAt}, 'YYYY-MM')`);

    const recoveryRows = await db
      .select({
        month: sql<string>`to_char(${abandonedCartEvents.recoveredAt}, 'YYYY-MM')`,
        revenue: sql<string>`coalesce(sum(${abandonedCartEvents.recoveredAmount}), 0)`,
      })
      .from(abandonedCartEvents)
      .where(and(isNotNull(abandonedCartEvents.recoveredAt), gte(abandonedCartEvents.recoveredAt, since)))
      .groupBy(sql`to_char(${abandonedCartEvents.recoveredAt}, 'YYYY-MM')`);

    const byMonth = new Map<string, { couponDiscount: number; generatedRevenue: number; recoveredRevenue: number }>();

    // Seed every month in range so a quiet month shows as zero rather than
    // vanishing from the chart and shifting the ones after it.
    for (let i = 0; i < months; i++) {
      const d = new Date(since);
      d.setMonth(since.getMonth() + i);
      byMonth.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, {
        couponDiscount: 0,
        generatedRevenue: 0,
        recoveredRevenue: 0,
      });
    }

    for (const r of couponRows) {
      const bucket = byMonth.get(r.month);
      if (!bucket) continue;
      bucket.couponDiscount = Number(r.discount ?? 0);
      bucket.generatedRevenue = Number(r.revenue ?? 0);
    }
    for (const r of recoveryRows) {
      const bucket = byMonth.get(r.month);
      if (!bucket) continue;
      bucket.recoveredRevenue = Number(r.revenue ?? 0);
    }

    return [...byMonth.entries()].map(([month, v]) => ({ month, ...v }));
  },

  /** Total paid revenue, used as the denominator for marketing contribution. */
  totalRevenue: async (): Promise<number> => {
    const [row] = await db
      .select({ total: sql<string>`coalesce(sum(${orders.payableAmount}), 0)` })
      .from(orders);
    return Number(row?.total ?? 0);
  },
};
