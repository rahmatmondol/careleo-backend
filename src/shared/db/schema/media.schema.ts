import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './auth';

/**
 * Media library — ported from the standalone media-service.
 *
 * media-service created its tables with raw `CREATE TABLE IF NOT EXISTS` SQL at
 * boot (`ensureSchema()`); they are declared in Drizzle here so they take part
 * in the normal schema-first `db:generate` / `db:migrate` flow like every other
 * table. Column types match the original DDL exactly so the data migration is a
 * straight copy.
 */

export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull().unique(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    originalName: varchar('original_name', { length: 255 }),
    storageKey: varchar('storage_key', { length: 500 }),
    url: text('url').notNull(),
    mimeType: varchar('mime_type', { length: 120 }).notNull(),
    fileType: varchar('file_type', { length: 20 }).notNull(),
    fileSize: bigint('file_size', { mode: 'number' }).notNull().default(0),
    width: integer('width'),
    height: integer('height'),
    durationSeconds: integer('duration_seconds'),
    altText: varchar('alt_text', { length: 500 }),
    caption: text('caption'),
    description: text('description'),
    metadata: jsonb('metadata').notNull().default({}),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    isPublic: boolean('is_public').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_media_assets_type').on(t.fileType),
    index('idx_media_assets_active').on(t.isActive, t.deletedAt),
  ],
);

export const mediaLinks = pgTable(
  'media_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    /**
     * Polymorphic pointer — `entityType` names the owning table ('product',
     * 'brand', 'category', ...), so `entityId` cannot be a foreign key.
     */
    entityType: varchar('entity_type', { length: 80 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    fieldName: varchar('field_name', { length: 80 }).notNull().default('default'),
    usageType: varchar('usage_type', { length: 30 }).notNull().default('primary'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    metadata: jsonb('metadata').notNull().default({}),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('media_links_media_entity_field_uniq').on(
      t.mediaId,
      t.entityType,
      t.entityId,
      t.fieldName,
    ),
    index('idx_media_links_entity').on(t.entityType, t.entityId),
    index('idx_media_links_media_id').on(t.mediaId),
  ],
);
