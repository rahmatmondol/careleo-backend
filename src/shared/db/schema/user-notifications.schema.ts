import { boolean, index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './auth';

export const userNotifications = pgTable(
  'user_notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 40 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body').notNull(),
    dataJson: text('data_json'),
    isRead: boolean('is_read').notNull().default(false),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_un_user_id').on(table.userId),
    index('idx_un_user_read').on(table.userId, table.isRead),
    index('idx_un_created_at').on(table.createdAt),
  ],
);
