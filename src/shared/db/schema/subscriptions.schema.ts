import {
  boolean,
  index,
  jsonb,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import type { FeatureFlags, PlanLimits } from '@/modules/subscriptions/catalog';

/**
 * Subscription plans — admin-managed tiers. Feature membership is NOT
 * hard-coded: `featureFlags` toggles capabilities (keyed by FeatureKey) and
 * `limits` sets numeric caps (keyed by LimitKey). See modules/subscriptions/catalog.ts.
 */
export const subscriptionPlans = pgTable(
  'subscription_plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 120 }).notNull().unique(),
    description: varchar('description', { length: 500 }),
    price: numeric('price', { precision: 10, scale: 2 }).notNull().default('0'),
    billingCycle: varchar('billing_cycle', { length: 20 }).notNull().default('monthly'),
    featureFlags: jsonb('feature_flags').$type<FeatureFlags>().notNull().default({}),
    limits: jsonb('limits').$type<PlanLimits>().notNull().default({}),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: numeric('sort_order').notNull().default('0'),

    // ── RevenueCat mapping ───────────────────────────────────────────────────
    // A plan is what CareLeo grants; a RevenueCat product is what the user
    // actually buys. The two are mapped here rather than in code so a new tier
    // (or a re-priced store product) is an admin edit, not a deploy.
    //
    // `rcEntitlementId` is the primary key of the mapping: RevenueCat reports
    // entitlements on every event and the store products behind one entitlement
    // change over time (monthly/annual, price increases, grandfathered SKUs).
    // The three product ids are the fallback for events that name a product but
    // no entitlement, and are what each client asks the store to sell.
    /** RevenueCat entitlement identifier this plan grants (e.g. "premium"). */
    rcEntitlementId: varchar('rc_entitlement_id', { length: 190 }),
    /** App Store product identifier. */
    rcProductIdIos: varchar('rc_product_id_ios', { length: 190 }),
    /** Play Store product identifier (`sku:base_plan` for subscriptions). */
    rcProductIdAndroid: varchar('rc_product_id_android', { length: 190 }),
    /** RevenueCat Web Billing product identifier. */
    rcProductIdWeb: varchar('rc_product_id_web', { length: 190 }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_subscription_plans_active').on(table.isActive),
    index('idx_subscription_plans_rc_entitlement').on(table.rcEntitlementId),
  ],
);

/**
 * User subscriptions — links a user to their current plan. One active row per
 * user is expected; status drives whether the plan's entitlements apply.
 */
export const userSubscriptions = pgTable(
  'user_subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => subscriptionPlans.id, { onDelete: 'restrict' }),
    /** 'active' | 'in_grace' | 'paused' | 'expired' | 'canceled' */
    status: varchar('status', { length: 20 }).notNull().default('active'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull().defaultNow(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),

    // ── Provenance ───────────────────────────────────────────────────────────
    // 'manual' rows are granted by an admin or by the legacy /subscribe route
    // and never expire on their own; 'revenuecat' rows are owned by the
    // webhook and must not be edited by hand — the next event would overwrite
    // the change anyway. `provider` is what tells the two apart.
    /** 'manual' | 'revenuecat' */
    provider: varchar('provider', { length: 20 }).notNull().default('manual'),
    /** 'app_store' | 'play_store' | 'rc_billing' | 'stripe' | 'promotional' | … */
    store: varchar('store', { length: 40 }),
    /** The RevenueCat app user id that owns the purchase. */
    rcAppUserId: varchar('rc_app_user_id', { length: 190 }),
    rcEntitlementId: varchar('rc_entitlement_id', { length: 190 }),
    rcProductId: varchar('rc_product_id', { length: 190 }),
    /**
     * RevenueCat's stable id for the whole subscription across renewals. Used
     * to tell a genuine new purchase from a renewal of the one we already hold.
     */
    rcOriginalTransactionId: varchar('rc_original_transaction_id', { length: 190 }),
    /** False once the user cancels or hits a billing issue the store gave up on. */
    willRenew: boolean('will_renew').notNull().default(true),
    isTrial: boolean('is_trial').notNull().default(false),
    /**
     * Event clock, not wall clock. RevenueCat does not guarantee delivery
     * order, so a retried EXPIRATION can land after the RENEWAL that followed
     * it; the handler drops any event older than what a row already reflects.
     */
    lastEventAtMs: numeric('last_event_at_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_user_subscriptions_user_id').on(table.userId),
    index('idx_user_subscriptions_status').on(table.status),
  ],
);

/**
 * Which shop products a plan covers — the "monthly food supply" benefit.
 *
 * A plan grants a `monthly_food_budget` (see catalog.ts); these rows say what
 * that budget may be spent on. A cart line is eligible when a rule matches it
 * by category or by product. No rules at all = nothing is covered, even if the
 * plan has a budget, so a misconfigured plan fails closed.
 *
 * `refId` is polymorphic (a `categories.id` or a `products.id`) so it carries
 * no foreign key — same reasoning as the four columns listed in
 * docs/microservices/merge-into-monolith.md.
 */
export const planCoverageRules = pgTable(
  'plan_coverage_rules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => subscriptionPlans.id, { onDelete: 'cascade' }),
    /** 'category' | 'product' */
    scope: varchar('scope', { length: 20 }).notNull(),
    refId: uuid('ref_id').notNull(),
    /** Max units per billing period, null = capped only by the budget. */
    monthlyQtyLimit: numeric('monthly_qty_limit'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_plan_coverage_rules_plan').on(table.planId),
    uniqueIndex('uq_plan_coverage_rules_plan_scope_ref').on(table.planId, table.scope, table.refId),
  ],
);

/**
 * How much of the plan benefit a user has already spent this billing period.
 *
 * This exists as its own row (rather than being summed from `orders`) because
 * checkout must *lock* it: two carts checked out at the same moment would
 * otherwise each read the same remaining budget and both be covered. The
 * checkout transaction takes `SELECT … FOR UPDATE` on this row before
 * deciding coverage.
 *
 * `periodStart` comes from the user's subscription period, not the calendar
 * month, so a plan bought mid-month gets a full period.
 */
export const subscriptionBenefitUsage = pgTable(
  'subscription_benefit_usage',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    amountUsed: numeric('amount_used', { precision: 10, scale: 2 }).notNull().default('0'),
    /** Units consumed per coverage rule this period: `{ [ruleId]: qty }`. */
    qtyUsedJson: jsonb('qty_used_json').$type<Record<string, number>>().notNull().default({}),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_subscription_benefit_usage_user_period').on(table.userId, table.periodStart)],
);

/**
 * Raw RevenueCat webhook events.
 *
 * Kept for two reasons: RevenueCat retries a delivery until it gets a 2xx, so
 * the unique index on `eventId` is what makes redelivery a no-op; and when a
 * user disputes their tier, the payload we actually acted on is the only
 * record — the store's receipt lives in Apple/Google, not here.
 *
 * `userId` is nullable: a webhook can arrive for an app user id that does not
 * resolve to a CareLeo user (an anonymous `$RCAnonymousID:` purchase made
 * before login). Those rows are stored unresolved and re-checked when a
 * TRANSFER event later attaches them to a real account.
 */
export const revenuecatEvents = pgTable(
  'revenuecat_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    /** RevenueCat's own event id — the idempotency key. */
    eventId: varchar('event_id', { length: 120 }).notNull(),
    type: varchar('type', { length: 40 }).notNull(),
    /** The RC app user id the event is about (we set this to the CareLeo user id). */
    appUserId: varchar('app_user_id', { length: 190 }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    productId: varchar('product_id', { length: 190 }),
    /** 'app_store' | 'play_store' | 'rc_billing' | 'stripe' | 'promotional' | … */
    store: varchar('store', { length: 40 }),
    /** 'SANDBOX' | 'PRODUCTION' — sandbox events must not grant a paid tier in prod. */
    environment: varchar('environment', { length: 20 }),
    eventTimestampMs: numeric('event_timestamp_ms'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    /** 'received' | 'processed' | 'ignored' | 'failed' */
    status: varchar('status', { length: 20 }).notNull().default('received'),
    /** Why an event was ignored, or the error that made it fail. */
    note: varchar('note', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_revenuecat_events_event_id').on(table.eventId),
    index('idx_revenuecat_events_user').on(table.userId),
    index('idx_revenuecat_events_created').on(table.createdAt),
  ],
);
