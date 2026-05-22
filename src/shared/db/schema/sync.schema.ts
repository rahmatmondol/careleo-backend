import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Idempotent store of incoming Woo webhook events.
 */
export const wooWebhookEvents = pgTable(
  'woo_webhook_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventType: varchar('event_type', { length: 80 }).notNull(),
    webhookId: varchar('webhook_id', { length: 120 }),
    resourceId: integer('resource_id'),
    deliveryId: varchar('delivery_id', { length: 120 }).notNull(),
    signature: text('signature'),
    payload: jsonb('payload').notNull(),
    processed: boolean('processed').notNull().default(false),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_woo_webhook_delivery_id').on(table.deliveryId),
    index('idx_woo_webhook_event_type').on(table.eventType),
  ],
);

/**
 * Generic integration sync job history.
 */
export const integrationSyncJobs = pgTable(
  'integration_sync_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: varchar('provider', { length: 40 }).notNull(),
    jobType: varchar('job_type', { length: 80 }).notNull(),
    status: varchar('status', { length: 30 }).notNull().default('queued'),
    meta: jsonb('meta'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_sync_jobs_provider_status').on(table.provider, table.status)],
);
