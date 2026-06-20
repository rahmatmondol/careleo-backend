import { index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { pets } from './pets.schema';
import { users } from './auth';

/**
 * Vaccination records per pet. givenAt = administered date; dueAt = next/due
 * date (drives the vaccine-due proactive reminder). status reflects lifecycle.
 */
export const vaccinations = pgTable(
  'vaccinations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    vaccineName: varchar('vaccine_name', { length: 160 }).notNull(),
    givenAt: varchar('given_at', { length: 40 }),
    dueAt: varchar('due_at', { length: 40 }),
    status: varchar('status', { length: 20 }).notNull().default('due'),
    notes: text('notes'),
    lastRemindedAt: timestamp('last_reminded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_vaccinations_pet_id').on(table.petId),
    index('idx_vaccinations_user_id').on(table.userId),
    index('idx_vaccinations_status').on(table.status),
  ],
);
