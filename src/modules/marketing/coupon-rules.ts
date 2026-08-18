import type { CouponRow } from './model';

/**
 * The rules that decide whether a code applies and what it is worth.
 *
 * Pure functions with no database access, deliberately: the same logic has to
 * run twice — once when the storefront asks "is this code any good?" and again
 * inside the checkout transaction where the answer actually spends money. If
 * those two disagreed, a customer would be quoted a discount they do not get.
 * Keeping the maths here is what guarantees they cannot drift.
 */

export const COUPON_TYPES = ['percentage', 'fixed_amount', 'free_shipping'] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

/** Everything the rules need to judge a cart, without knowing about carts. */
export type CouponContext = {
  /** Amount the customer would pay before this discount. */
  payableAmount: number;
  /** Products in the order, for coupons restricted to a subset. */
  productIds: string[];
  /** Portion of `payableAmount` attributable to the restricted products. */
  eligibleAmount: number;
  /** How many times this user has already redeemed this code. */
  userRedemptions: number;
  now: Date;
};

export type CouponVerdict =
  | { ok: true; discount: number; note?: string }
  | { ok: false; reason: string };

const money = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Round to cents. Floating-point sums otherwise leak 0.30000000000000004 into orders. */
export const roundMoney = (v: number): number => Math.round(v * 100) / 100;

/**
 * Decide whether a coupon applies to a cart, and for how much.
 *
 * Every rejection returns a reason the storefront can show verbatim — a bare
 * "invalid coupon" makes a legitimate near-miss (spend a little more, wrong
 * products) look like a broken code.
 */
export const evaluateCoupon = (coupon: CouponRow, ctx: CouponContext): CouponVerdict => {
  if (!coupon.isActive) return { ok: false, reason: 'This coupon is no longer active' };

  if (coupon.startsAt && ctx.now < new Date(coupon.startsAt)) {
    return { ok: false, reason: 'This coupon is not available yet' };
  }
  if (coupon.endsAt && ctx.now > new Date(coupon.endsAt)) {
    return { ok: false, reason: 'This coupon has expired' };
  }

  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    return { ok: false, reason: 'This coupon has reached its usage limit' };
  }
  if (coupon.perUserLimit !== null && ctx.userRedemptions >= coupon.perUserLimit) {
    return { ok: false, reason: 'You have already used this coupon' };
  }

  const minPurchase = coupon.minPurchaseAmount === null ? 0 : money(coupon.minPurchaseAmount);
  if (minPurchase > 0 && ctx.payableAmount < minPurchase) {
    return { ok: false, reason: `This coupon needs a minimum order of ${minPurchase.toFixed(2)}` };
  }

  // A restricted coupon discounts only the qualifying lines, not the whole cart.
  const restricted = (coupon.applicableProductIds ?? []).length > 0;
  if (restricted) {
    const allowed = new Set(coupon.applicableProductIds);
    if (!ctx.productIds.some((id) => allowed.has(id))) {
      return { ok: false, reason: 'This coupon does not apply to the items in your cart' };
    }
  }
  const base = restricted ? ctx.eligibleAmount : ctx.payableAmount;

  if (coupon.type === 'free_shipping') {
    // Orders carry no shipping charge in this system yet (see shop.schema.ts),
    // so there is nothing to waive. The code is accepted rather than rejected —
    // it is validly configured — but it is worth zero, and says so instead of
    // quietly reporting a discount the customer will not see.
    return { ok: true, discount: 0, note: 'Free shipping is not charged on orders yet, so this coupon saves nothing' };
  }

  let discount: number;
  if (coupon.type === 'percentage') {
    discount = base * (money(coupon.value) / 100);
    if (coupon.maxDiscountAmount !== null) {
      discount = Math.min(discount, money(coupon.maxDiscountAmount));
    }
  } else {
    discount = money(coupon.value);
  }

  // Never discount below zero — a fixed-amount coupon larger than the order
  // would otherwise produce a negative payable, i.e. paying the customer.
  discount = roundMoney(Math.max(0, Math.min(discount, base)));

  if (discount <= 0) return { ok: false, reason: 'This coupon has no value for this order' };
  return { ok: true, discount };
};

/**
 * Status as the admin panel shows it — derived from dates and flags, never
 * stored, so a scheduled coupon becomes active without anything running.
 */
export const couponStatus = (coupon: CouponRow, now = new Date()): 'active' | 'scheduled' | 'expired' | 'disabled' => {
  if (!coupon.isActive) return 'disabled';
  if (coupon.startsAt && now < new Date(coupon.startsAt)) return 'scheduled';
  if (coupon.endsAt && now > new Date(coupon.endsAt)) return 'expired';
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) return 'expired';
  return 'active';
};
