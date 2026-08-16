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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_subscription_plans_active').on(table.isActive)],
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
    status: varchar('status', { length: 20 }).notNull().default('active'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull().defaultNow(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
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