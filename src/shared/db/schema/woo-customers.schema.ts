import { index, integer, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Local cache for WooCommerce customers.
 */
export const wooCustomersCache = pgTable(
  'woo_customers_cache',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    wooCustomerId: integer('woo_customer_id').notNull().unique(),
    email: varchar('email', { length: 255 }),
    firstName: varchar('first_name', { length: 120 }),
    lastName: varchar('last_name', { length: 120 }),
    role: varchar('role', { length: 80 }),
    payload: jsonb('payload').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_woo_customers_cache_woo_id').on(table.wooCustomerId)],
);
