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
    frequency: varchar('frequency', { length: 40 }).notNull().default('none'),
    dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
    notes: text('notes'),
    isCompleted: boolean('is_completed').notNull().default(false),
    /**
     * When the task was actually ticked off.
     *
     * `updatedAt` cannot answer this — any edit moves it. The gap between
     * `dueDate` and this is what the adaptive scheduler learns from, and what
     * medication adherence is measured against.
     */
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /**
     * Who ticked it off — null means the owner.
     *
     * Matters now that a pet can have a care circle: "Dad gave the 8pm dose" is
     * the answer to a question two people in a household actually have.
     */
    completedBy: uuid('completed_by').references(() => users.id, { onDelete: 'set null' }),
    /**
     * Deliberately not done, as opposed to forgotten.
     *
     * "The vet said skip today's dose" and "I forgot" are the same row without
     * this, which makes the adherence figure shown to a vet quietly wrong. A
     * skipped task stops nagging and still rolls the recurrence forward, but is
     * excluded from adherence rather than counted as a miss.
     */
    skippedAt: timestamp('skipped_at', { withTimezone: true }),
    skipReason: varchar('skip_reason', { length: 200 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tasks_user_id').on(table.userId),
    index('idx_tasks_completed_at').on(table.completedAt),
    index('idx_tasks_skipped_at').on(table.skippedAt),
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
