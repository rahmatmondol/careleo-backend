import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { pets } from './pets.schema';
import { aiChatSessions } from './ai.schema';

/**
 * Structured health & lifestyle profile per pet — built from doctor-style
 * profiling Q&A and enriched over time. One row per pet; fields are nullable
 * and filled in incrementally. This is the foundation for smart suggestions.
 */
export const petProfiles = pgTable(
  'pet_profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    dietBrand: varchar('diet_brand', { length: 200 }),
    dietType: varchar('diet_type', { length: 120 }),
    dailyAmount: varchar('daily_amount', { length: 120 }),
    activityLevel: varchar('activity_level', { length: 120 }),
    allergies: jsonb('allergies').$type<string[]>().notNull().default([]),
    healthConditions: jsonb('health_conditions').$type<string[]>().notNull().default([]),
    medications: jsonb('medications').$type<string[]>().notNull().default([]),
    vaccinationStatus: varchar('vaccination_status', { length: 200 }),
    groomingNotes: text('grooming_notes'),
    behaviorNotes: text('behavior_notes'),
    completeness: integer('completeness').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_pet_profiles_pet_id').on(table.petId)],
);

/**
 * Free-form facts learned about a pet over time (from profiling, chat, or
 * manual entry). Superseded facts are kept (supersededBy points at the newer
 * row) so history is preserved; "active" = supersededBy IS NULL.
 */
export const petFacts = pgTable(
  'pet_facts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    category: varchar('category', { length: 40 }).notNull().default('other'),
    fact: text('fact').notNull(),
    source: varchar('source', { length: 20 }).notNull().default('chat'),
    sessionId: uuid('session_id').references(() => aiChatSessions.id, { onDelete: 'set null' }),
    confidence: numeric('confidence', { precision: 3, scale: 2 }).notNull().default('1'),
    supersededBy: uuid('superseded_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_pet_facts_pet_id').on(table.petId),
    index('idx_pet_facts_category').on(table.category),
  ],
);
