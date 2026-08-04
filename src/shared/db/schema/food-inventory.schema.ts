import {
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { pets } from './pets.schema';
import { users } from './auth';

/**
 * Per-pet food stock the AI tracks. productId references a shop module product
 * (no cross-service FK). quantityUnits + dailyConsumption drive days-remaining
 * and the low-stock alert.
 */
export const foodInventory = pgTable(
  'food_inventory',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    productId: uuid('product_id'), // shop module product id (nullable until linked)
    productName: varchar('product_name', { length: 200 }),
    quantityUnits: numeric('quantity_units', { precision: 12, scale: 2 }).notNull().default('0'),
    dailyConsumption: numeric('daily_consumption', { precision: 12, scale: 2 }).notNull().default('0'),
    lowStockThresholdDays: integer('low_stock_threshold_days').notNull().default(3),
    lastReorderedAt: timestamp('last_reordered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_food_inventory_pet_id').on(table.petId),
    index('idx_food_inventory_user_id').on(table.userId),
  ],
);

/**
 * Re-order requests/history. status: pending_confirm | placed | auto_placed |
 * cancelled | failed. mode: assisted (user confirms) | auto (Premium, background).
 * shopOrderId is the shop module's order id once placed.
 */
export const reorders = pgTable(
  'reorders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    petId: uuid('pet_id').references(() => pets.id, { onDelete: 'set null' }),
    inventoryId: uuid('inventory_id').references(() => foodInventory.id, { onDelete: 'set null' }),
    productId: uuid('product_id'),
    productName: varchar('product_name', { length: 200 }),
    quantity: integer('quantity').notNull().default(1),
    mode: varchar('mode', { length: 20 }).notNull().default('assisted'),
    status: varchar('status', { length: 20 }).notNull().default('pending_confirm'),
    shopOrderId: uuid('shop_order_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_reorders_user_id').on(table.userId),
    index('idx_reorders_status').on(table.status),
  ],
);
