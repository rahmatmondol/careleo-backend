import {
  boolean,
  index,
  jsonb,
  numeric,
  pgTable,
  timestamp,
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