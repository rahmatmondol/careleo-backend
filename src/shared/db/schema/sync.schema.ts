import { index, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

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
