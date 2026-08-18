import { NotFoundError, ValidationError } from '@/shared/errors';
import { db } from '@/shared/db';
import { cartItems, products } from '@/shared/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { COUPON_TYPES, couponStatus, evaluateCoupon, type CouponType } from './coupon-rules';
import { MarketingModel, type CouponRow } from './model';

const NOTIFICATION_CHANNELS = ['email', 'web_push', 'mobile_push'];

const str = (v: unknown): string => String(v ?? '').trim();

/** Optional money field: blank/absent means "no limit", not zero. */
const optionalMoney = (v: unknown, field: string): string | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new ValidationError(`${field} must be 0 or more`);
  return String(n);
};

/** Optional whole-number field: blank/absent means unlimited. */
const optionalInt = (v: unknown, field: string): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new ValidationError(`${field} must be a whole number of 0 or more`);
  return n;
};

const optionalDate = (v: unknown, field: string): Date | null => {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new ValidationError(`${field} is not a valid date`);
  return d;
};

/** Shape a coupon row for the admin panel: derived status + numbers, not strings. */
const presentCoupon = (row: CouponRow) => ({
  id: row.id,
  code: row.code,
  type: row.type,
  value: Number(row.value),
  minPurchaseAmount: row.minPurchaseAmount === null ? null : Number(row.minPurchaseAmount),
  maxDiscountAmount: row.maxDiscountAmount === null ? null : Number(row.maxDiscountAmount),
  startsAt: row.startsAt,
  endsAt: row.endsAt,
  usageLimit: row.usageLimit,
  perUserLimit: row.perUserLimit,
  usedCount: row.usedCount,
  applicableProductIds: row.applicableProductIds ?? [],
  isActive: row.isActive,
  description: row.description,
  status: couponStatus(row),
  createdAt: row.createdAt,
});

export const MarketingService = {
  // ── Coupons ────────────────────────────────────────────────────────────────
  listCoupons: async () => ({ coupons: (await MarketingModel.listCoupons()).map(presentCoupon) }),

  getCoupon: async (id: string) => {
    const row = await MarketingModel.getCoupon(id);
    if (!row) throw new NotFoundError('Coupon not found');
    return { coupon: presentCoupon(row) };
  },

  createCoupon: async (body: Record<string, unknown>) => {
    const code = str(body.code).toUpperCase();
    if (!code) throw new ValidationError('Coupon code is required');
    if (await MarketingModel.getCouponByCode(code)) {
      throw new ValidationError(`A coupon with code "${code}" already exists`);
    }

    const type = str(body.type) as CouponType;
    if (!COUPON_TYPES.includes(type)) {
      throw new ValidationError(`Coupon type must be one of: ${COUPON_TYPES.join(', ')}`);
    }

    const value = Number(body.value ?? 0);
    if (!Number.isFinite(value) || value < 0) throw new ValidationError('Coupon value must be 0 or more');
    if (type === 'percentage' && value > 100) {
      throw new ValidationError('A percentage coupon cannot exceed 100');
    }

    const row = await MarketingModel.createCoupon({
      code,
      type,
      value: String(value),
      minPurchaseAmount: optionalMoney(body.minPurchaseAmount, 'Minimum purchase'),
      maxDiscountAmount: optionalMoney(body.maxDiscountAmount, 'Maximum discount'),
      startsAt: optionalDate(body.startsAt ?? body.startDate, 'Start date'),
      endsAt: optionalDate(body.endsAt ?? body.endDate, 'End date'),
      usageLimit: optionalInt(body.usageLimit, 'Usage limit'),
      perUserLimit: optionalInt(body.perUserLimit, 'Per-user limit'),
      applicableProductIds: Array.isArray(body.applicableProductIds)
        ? body.applicableProductIds.map(String)
        : [],
      isActive: body.isActive === undefined ? true : Boolean(body.isActive),
      description: body.description === undefined ? null : str(body.description) || null,
    });
    return { coupon: presentCoupon(row) };
  },

  updateCoupon: async (id: string, body: Record<string, unknown>) => {
    const existing = await MarketingModel.getCoupon(id);
    if (!existing) throw new NotFoundError('Coupon not found');

    const patch: Record<string, unknown> = {};

    if (body.code !== undefined) {
      const code = str(body.code).toUpperCase();
      if (!code) throw new ValidationError('Coupon code is required');
      const clash = await MarketingModel.getCouponByCode(code);
      if (clash && clash.id !== id) throw new ValidationError(`A coupon with code "${code}" already exists`);
      patch.code = code;
    }
    if (body.type !== undefined) {
      const type = str(body.type) as CouponType;
      if (!COUPON_TYPES.includes(type)) {
        throw new ValidationError(`Coupon type must be one of: ${COUPON_TYPES.join(', ')}`);
      }
      patch.type = type;
    }
    if (body.value !== undefined) {
      const value = Number(body.value);
      if (!Number.isFinite(value) || value < 0) throw new ValidationError('Coupon value must be 0 or more');
      const type = (patch.type ?? existing.type) as string;
      if (type === 'percentage' && value > 100) throw new ValidationError('A percentage coupon cannot exceed 100');
      patch.value = String(value);
    }
    if (body.minPurchaseAmount !== undefined) patch.minPurchaseAmount = optionalMoney(body.minPurchaseAmount, 'Minimum purchase');
    if (body.maxDiscountAmount !== undefined) patch.maxDiscountAmount = optionalMoney(body.maxDiscountAmount, 'Maximum discount');
    if (body.startsAt !== undefined || body.startDate !== undefined) {
      patch.startsAt = optionalDate(body.startsAt ?? body.startDate, 'Start date');
    }
    if (body.endsAt !== undefined || body.endDate !== undefined) {
      patch.endsAt = optionalDate(body.endsAt ?? body.endDate, 'End date');
    }
    if (body.usageLimit !== undefined) patch.usageLimit = optionalInt(body.usageLimit, 'Usage limit');
    if (body.perUserLimit !== undefined) patch.perUserLimit = optionalInt(body.perUserLimit, 'Per-user limit');
    if (body.applicableProductIds !== undefined) {
      patch.applicableProductIds = Array.isArray(body.applicableProductIds)
        ? body.applicableProductIds.map(String)
        : [];
    }
    if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);
    if (body.description !== undefined) patch.description = str(body.description) || null;

    // `usedCount` is never patchable: it is the redemption ledger's total, and
    // letting an admin edit it would let a code outrun its own usage limit.
    const row = await MarketingModel.updateCoupon(id, patch);
    return { coupon: presentCoupon(row!) };
  },

  deleteCoupon: async (id: string) => {
    const existing = await MarketingModel.getCoupon(id);
    if (!existing) throw new NotFoundError('Coupon not found');
    await MarketingModel.deleteCoupon(id);
    return { deleted: true };
  },

  /**
   * Check a code against the caller's current cart without spending it.
   *
   * The storefront calls this to show "you saved X" before checkout. The number
   * it returns is advisory — checkout recomputes it under a row lock, because
   * between this call and the order the cart can change and the last remaining
   * use of the code can be taken by someone else.
   */
  previewCoupon: async (userId: string, code: string) => {
    const trimmed = str(code);
    if (!trimmed) throw new ValidationError('A coupon code is required');

    const coupon = await MarketingModel.getCouponByCode(trimmed);
    if (!coupon) return { valid: false, reason: 'That coupon code was not found' };

    const items = await db.select().from(cartItems).where(eq(cartItems.userId, userId));
    if (!items.length) return { valid: false, reason: 'Your cart is empty' };

    const productRows = await db
      .select({ id: products.id, price: products.price })
      .from(products)
      .where(inArray(products.id, items.map((i) => i.productId)));
    const priceById = new Map(productRows.map((p) => [p.id, Number(p.price)]));

    const allowed = new Set(coupon.applicableProductIds ?? []);
    let payableAmount = 0;
    let eligibleAmount = 0;
    for (const item of items) {
      const lineTotal = (priceById.get(item.productId) ?? 0) * item.quantity;
      payableAmount += lineTotal;
      if (allowed.has(item.productId)) eligibleAmount += lineTotal;
    }

    const verdict = evaluateCoupon(coupon, {
      payableAmount,
      eligibleAmount,
      productIds: items.map((i) => i.productId),
      userRedemptions: await MarketingModel.countUserRedemptions(coupon.id, userId),
      now: new Date(),
    });

    if (!verdict.ok) return { valid: false, reason: verdict.reason };
    return {
      valid: true,
      code: coupon.code,
      type: coupon.type,
      discount: verdict.discount,
      note: verdict.note ?? null,
      // Advisory: the cart's own coverage/stock checks still run at checkout.
      payableAfterDiscount: Math.max(0, payableAmount - verdict.discount),
    };
  },

  // ── Abandoned-cart rules ───────────────────────────────────────────────────
  listRules: async () => {
    const [rules, performance] = await Promise.all([
      MarketingModel.listRules(),
      MarketingModel.rulePerformance(),
    ]);
    return {
      rules: rules.map((r) => {
        const perf = performance.get(r.id) ?? { sentCount: 0, recoveredCount: 0, recoveredRevenue: 0 };
        return {
          id: r.id,
          name: r.name,
          triggerTimeHours: r.triggerTimeHours,
          channels: r.channels ?? [],
          template: { subject: r.templateSubject, body: r.templateBody },
          offerCouponId: r.offerCouponId,
          isActive: r.isActive,
          createdAt: r.createdAt,
          sentCount: perf.sentCount,
          recoveredCount: perf.recoveredCount,
          recoveredRevenue: perf.recoveredRevenue,
          conversionRate: perf.sentCount ? Math.round((perf.recoveredCount / perf.sentCount) * 1000) / 10 : 0,
        };
      }),
    };
  },

  createRule: async (body: Record<string, unknown>) => {
    const name = str(body.name);
    if (!name) throw new ValidationError('Rule name is required');

    const rule = await MarketingModel.createRule({
      name,
      triggerTimeHours: sanitizeTrigger(body.triggerTimeHours),
      channels: sanitizeChannels(body.channels),
      templateSubject: str((body.template as Record<string, unknown>)?.subject ?? body.templateSubject),
      templateBody: str((body.template as Record<string, unknown>)?.body ?? body.templateBody),
      offerCouponId: body.offerCouponId ? str(body.offerCouponId) : null,
      isActive: body.isActive === undefined ? true : Boolean(body.isActive),
    });
    return { rule };
  },

  updateRule: async (id: string, body: Record<string, unknown>) => {
    const existing = await MarketingModel.getRule(id);
    if (!existing) throw new NotFoundError('Abandoned cart rule not found');

    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = str(body.name);
      if (!name) throw new ValidationError('Rule name is required');
      patch.name = name;
    }
    if (body.triggerTimeHours !== undefined) patch.triggerTimeHours = sanitizeTrigger(body.triggerTimeHours);
    if (body.channels !== undefined) patch.channels = sanitizeChannels(body.channels);

    const template = body.template as Record<string, unknown> | undefined;
    if (template?.subject !== undefined || body.templateSubject !== undefined) {
      patch.templateSubject = str(template?.subject ?? body.templateSubject);
    }
    if (template?.body !== undefined || body.templateBody !== undefined) {
      patch.templateBody = str(template?.body ?? body.templateBody);
    }
    if (body.offerCouponId !== undefined) patch.offerCouponId = body.offerCouponId ? str(body.offerCouponId) : null;
    if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);

    const rule = await MarketingModel.updateRule(id, patch);
    return { rule };
  },

  deleteRule: async (id: string) => {
    const existing = await MarketingModel.getRule(id);
    if (!existing) throw new NotFoundError('Abandoned cart rule not found');
    await MarketingModel.deleteRule(id);
    return { deleted: true };
  },

  // ── Analytics ──────────────────────────────────────────────────────────────
  /**
   * Marketing dashboard figures.
   *
   * Everything here is computed from redemption and recovery rows. Referrals
   * and loyalty points are reported as zero and flagged in `unavailable`:
   * neither feature exists in this system, and inventing a plausible number
   * for a dashboard an admin makes spend decisions on is worse than an
   * honest zero.
   */
  analytics: async () => {
    const [couponTotals, recovery, activeRules, monthly, totalRevenue] = await Promise.all([
      MarketingModel.couponTotals(),
      MarketingModel.cartRecoveryTotals(),
      MarketingModel.countActiveRules(),
      MarketingModel.monthlyImpact(6),
      MarketingModel.totalRevenue(),
    ]);

    return {
      totalCouponsUsed: couponTotals.used,
      totalCouponDiscount: couponTotals.discount,
      revenueFromCoupons: couponTotals.attributedRevenue,

      activeRecoveryRules: activeRules,
      totalCartsAbandoned: recovery.abandoned,
      totalCartsRecovered: recovery.recovered,
      totalRecoveredRevenue: recovery.revenue,
      averageRecoveryConversionRate: recovery.abandoned
        ? Math.round((recovery.recovered / recovery.abandoned) * 1000) / 10
        : 0,

      totalRevenue,
      monthlyRevenueImpact: monthly,

      totalReferrals: 0,
      loyaltyPointsIssued: 0,
      loyaltyPointsRedeemed: 0,
      /** Fields with no backing feature — the panel hides these rather than showing a fake 0. */
      unavailable: ['totalReferrals', 'loyaltyPointsIssued', 'loyaltyPointsRedeemed'],
    };
  },
};

function sanitizeTrigger(value: unknown): number {
  const n = Number(value ?? 24);
  if (!Number.isFinite(n) || n < 1) throw new ValidationError('Trigger time must be at least 1 hour');
  return Math.floor(n);
}

function sanitizeChannels(value: unknown): string[] {
  const list = Array.isArray(value) ? value.map(String) : [];
  const unknown = list.filter((c) => !NOTIFICATION_CHANNELS.includes(c));
  if (unknown.length) {
    throw new ValidationError(`Unknown notification channel(s): ${unknown.join(', ')}`);
  }
  return [...new Set(list)];
}
