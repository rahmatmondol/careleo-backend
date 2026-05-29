import { boolean, index, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { tasks } from './tasks.schema';

export const taskReminderLogs = pgTable(
  'task_reminder_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reminderStep: integer('reminder_step').notNull(),
    stepLabel: varchar('step_label', { length: 40 }).notNull(),
    taskTitle: varchar('task_title', { length: 180 }).notNull(),
    taskType: varchar('task_type', { length: 60 }),
    taskTypeBefore: varchar('task_type_before', { length: 60 }),
    taskDueDate: timestamp('task_due_date', { withTimezone: true }).notNull(),
    minutesSinceDue: integer('minutes_since_due').notNull(),
    wasCompleted: boolean('was_completed').notNull(),
    pushDelivered: boolean('push_delivered').notNull().default(false),
    pushSent: boolean('push_sent').notNull().default(false),
    pushSuccessCount: integer('push_success_count').notNull().default(0),
    pushFailureCount: integer('push_failure_count').notNull().default(0),
    firedAt: timestamp('fired_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_trl_task_id').on(table.taskId),
    index('idx_trl_user_id').on(table.userId),
    index('idx_trl_fired_at').on(table.firedAt),
    index('idx_trl_step').on(table.reminderStep),
    index('idx_trl_push_delivered').on(table.pushDelivered),
  ],
);
