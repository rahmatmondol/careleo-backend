import { boolean, index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { pets } from './pets.schema';

/**
 * User tasks linked to a specific pet.
 */
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 180 }).notNull(),
    taskType: varchar('task_type', { length: 60 }).notNull().default('OTHER'),
    dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
    notes: text('notes'),
    isCompleted: boolean('is_completed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tasks_user_id').on(table.userId),
    index('idx_tasks_pet_id').on(table.petId),
    index('idx_tasks_due_date').on(table.dueDate),
    index('idx_tasks_completed').on(table.isCompleted),
  ],
);

/**
 * User reminders linked to a specific pet.
 */
export const reminders = pgTable(
  'reminders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 180 }).notNull(),
    reminderType: varchar('reminder_type', { length: 60 }).notNull().default('activity'),
    frequency: varchar('frequency', { length: 40 }).notNull().default('Everyday'),
    reminderDate: varchar('reminder_date', { length: 30 }),
    reminderTime: varchar('reminder_time', { length: 20 }),
    notes: text('notes'),
    isCompleted: boolean('is_completed').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_reminders_user_id').on(table.userId),
    index('idx_reminders_pet_id').on(table.petId),
    index('idx_reminders_active').on(table.isActive),
  ],
);
