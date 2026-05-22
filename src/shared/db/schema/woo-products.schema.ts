import { index, integer, jsonb, numeric, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Local cache for WooCommerce products.
 */
export const wooProductsCache = pgTable(
  'woo_products_cache',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    wooProductId: integer('woo_product_id').notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }),
    status: varchar('status', { length: 40 }),
    type: varchar('type', { length: 40 }),
    price: numeric('price', { precision: 12, scale: 2 }),
    regularPrice: numeric('regular_price', { precision: 12, scale: 2 }),
    salePrice: numeric('sale_price', { precision: 12, scale: 2 }),
    stockStatus: varchar('stock_status', { length: 40 }),
    imageUrl: text('image_url'),
    payload: jsonb('payload').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_woo_products_cache_woo_id').on(table.wooProductId),
    index('idx_woo_products_cache_status').on(table.status),
  ],
);
