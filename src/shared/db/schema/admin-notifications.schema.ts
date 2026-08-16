import { index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './auth';

/**
 * Read state for the admin notification feed.
 *
 * The feed itself is *derived* — it is built on the fly from real rows in
 * `orders`, `reports`, `users`, `vet_appointments`, `support_tickets`,
 * `user_subscriptions` and `products`, so there is no notification row to
 * flip a boolean on (unlike `user_notifications`, which the push pipeline
 * writes). What we do have to persist is which admin has already seen which
 * event, hence this table.
 *
 * `eventKey` is the derived event's stable id — `order:<uuid>`,
 * `report:<uuid>`, `stock:<uuid>:<qty>`, … The stock key deliberately carries
 * the quantity so a product that drops further becomes unread again.
 */
export const adminNotificationReads = pgTable(
  'admin_notification_reads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventKey: varchar('event_key', { length: 200 }).notNull(),
    readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_admin_notification_reads_admin_event').on(table.adminId, table.eventKey),
    index('idx_admin_notification_reads_admin').on(table.adminId),
  ],
);
