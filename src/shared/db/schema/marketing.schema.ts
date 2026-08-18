import {
  boolean,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { orders } from './shop.schema';

/**
 * Marketing domain — discount codes and abandoned-cart recovery.
 *
 * Money-affecting, so two things are deliberate here:
 *
 * - **Redemptions are rows, not a counter.** `coupons.used_count` exists for
 *   cheap reads, but `coupon_redemptions` is the ledger: it is what enforces
 *   the per-user cap, what the analytics sum over, and what makes a refund or
 *   a dispute answerable. A counter alone cannot say *who* used a code.
 * - **Send/recovery is a row too.** An abandoned-cart rule's performance is
 *   derived from `abandoned_cart_events`, never stored on the rule, so editing
 *   a rule cannot rewrite its own history.
 */

export const coupons = pgTable(
  'coupons',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    /** Stored upper-cased; matching is exact so the code is unambiguous. */
    code: varchar('code', { length: 60 }).notNull(),
    /** 'percentage' | 'fixed_amount' | 'free_shipping' */
    type: varchar('type', { length: 20 }).notNull(),
    /** Percent (0–100) for `percentage`, currency amount for `fixed_amount`. */
    value: decimal('value', { precision: 10, scale: 2 }).notNull().default('0'),
    /** Order must reach this payable amount before the code applies. */
    minPurchaseAmount: decimal('min_purchase_amount', { precision: 10, scale: 2 }),
    /** Ceiling on a percentage discount, so `50% off` cannot cost unboundedly. */
    maxDiscountAmount: decimal('max_discount_amount', { precision: 10, scale: 2 }),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    /** Total redemptions allowed across all users; null = unlimited. */
    usageLimit: integer('usage_limit'),
    /** Redemptions allowed per user; null = unlimited. */
    perUserLimit: integer('per_user_limit'),
    /**
     * Denormalised count of `coupon_redemptions`. Incremented in the same
     * transaction as the redemption row and re-checked under a row lock, so it
     * cannot drift or be raced past `usageLimit`.
     */
    usedCount: integer('used_count').notNull().default(0),
    /** Empty = applies to the whole cart; otherwise only these products count. */
    applicableProductIds: jsonb('applicable_product_ids').$type<string[]>().notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    description: varchar('description', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_coupons_code').on(table.code),
    index('idx_coupons_active').on(table.isActive),
  ],
);

/**
 * One successful use of a coupon on one order.
 *
 * `orderId` is unique: an order carries at most one coupon, and the constraint
 * is what stops a retried checkout from redeeming the same code twice against
 * the same order.
 */
export const couponRedemptions = pgTable(
  'coupon_redemptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    couponId: uuid('coupon_id')
      .notNull()
      .references(() => coupons.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    /** What the customer actually saved — not recomputable later, prices move. */
    discountAmount: decimal('discount_amount', { precision: 10, scale: 2 }).notNull().default('0'),
    /** Order payable before the discount, so analytics can show attributed revenue. */
    orderAmount: decimal('order_amount', { precision: 10, scale: 2 }).notNull().default('0'),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_coupon_redemptions_order').on(table.orderId),
    index('idx_coupon_redemptions_coupon').on(table.couponId),
    index('idx_coupon_redemptions_user').on(table.userId),
  ],
);

/**
 * A rule for chasing carts that were filled and never checked out.
 *
 * `triggerTimeHours` is measured from the cart's newest item, not its oldest:
 * someone still adding things has not abandoned anything yet.
 */
export const abandonedCartRules = pgTable(
  'abandoned_cart_rules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 160 }).notNull(),
    triggerTimeHours: integer('trigger_time_hours').notNull().default(24),
    /** ('email' | 'web_push' | 'mobile_push')[] */
    channels: jsonb('channels').$type<string[]>().notNull().default([]),
    templateSubject: varchar('template_subject', { length: 200 }).notNull().default(''),
    templateBody: varchar('template_body', { length: 2000 }).notNull().default(''),
    /**
     * Optional carrot attached to the reminder. `set null` rather than cascade:
     * deleting a coupon must not delete the rule that mentioned it.
     */
    offerCouponId: uuid('offer_coupon_id').references(() => coupons.id, { onDelete: 'set null' }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_abandoned_cart_rules_active').on(table.isActive)],
);

/**
 * One reminder sent to one user by one rule — and whether it worked.
 *
 * The unique index on (rule, user, cart signature) is what stops the hourly job
 * from re-nagging the same person about the same cart every tick. The signature
 * changes when the cart's contents change, which correctly makes a genuinely
 * new cart eligible again.
 */
export const abandonedCartEvents = pgTable(
  'abandoned_cart_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => abandonedCartRules.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Hash of the cart's product/quantity set at send time. */
    cartSignature: varchar('cart_signature', { length: 120 }).notNull(),
    /** Cart value when the reminder went out — the revenue that was at risk. */
    cartValue: decimal('cart_value', { precision: 10, scale: 2 }).notNull().default('0'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    /** Set when an order follows the reminder; null means it did not work. */
    recoveredOrderId: uuid('recovered_order_id').references(() => orders.id, { onDelete: 'set null' }),
    recoveredAmount: decimal('recovered_amount', { precision: 10, scale: 2 }),
    recoveredAt: timestamp('recovered_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('uq_abandoned_cart_events_rule_user_cart').on(table.ruleId, table.userId, table.cartSignature),
    index('idx_abandoned_cart_events_rule').on(table.ruleId),
    index('idx_abandoned_cart_events_user_sent').on(table.userId, table.sentAt),
  ],
);
