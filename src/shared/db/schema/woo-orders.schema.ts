import { index, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Local cache for WooCommerce orders.
 */
export const wooOrdersCache = pgTable(
  'woo_orders_cache',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    wooOrderId: integer('woo_order_id').notNull().unique(),
    orderKey: varchar('order_key', { length: 120 }),
    status: varchar('status', { length: 40 }).notNull(),
    currency: varchar('currency', { length: 10 }),
    total: varchar('total', { length: 40 }),
    customerId: integer('customer_id'),
    billingEmail: varchar('billing_email', { length: 255 }),
    payload: jsonb('payload').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_woo_orders_cache_woo_id').on(table.wooOrderId),
    index('idx_woo_orders_cache_status').on(table.status),
  ],
);

/**
 * Cached line items per Woo order.
 */
export const wooOrderItemsCache = pgTable(
  'woo_order_items_cache',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    wooOrderId: integer('woo_order_id').notNull(),
    wooLineItemId: integer('woo_line_item_id').notNull(),
    productId: integer('product_id'),
    variationId: integer('variation_id'),
    name: text('name').notNull(),
    quantity: integer('quantity').notNull().default(1),
    total: varchar('total', { length: 40 }),
    payload: jsonb('payload').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_woo_order_items_order_id').on(table.wooOrderId),
    index('idx_woo_order_items_line_id').on(table.wooLineItemId),
  ],
);
