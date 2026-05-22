import { index, numeric, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './auth';

/**
 * Primary pet profile table owned by the app domain.
 */
export const pets = pgTable(
  'pets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 160 }).notNull(),
    type: varchar('type', { length: 80 }).notNull(),
    breed: varchar('breed', { length: 160 }),
    gender: varchar('gender', { length: 30 }),
    dob: varchar('dob', { length: 30 }),
    weight: numeric('weight', { precision: 10, scale: 2 }),
    color: varchar('color', { length: 120 }),
    microchipId: varchar('microchip_id', { length: 120 }),
    description: text('description'),
    photoUrl: text('photo_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_pets_user_id').on(table.userId),
    index('idx_pets_type').on(table.type),
    index('idx_pets_microchip').on(table.microchipId),
  ],
);

/**
 * Flexible per-pet preference storage used by app preference screens.
 */
export const petPreferences = pgTable(
  'pet_preferences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    dietType: text('diet_type'),
    activityLevel: text('activity_level'),
    healthConditions: text('health_conditions'),
    preferenceJson: text('preference_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_pet_preferences_pet_id').on(table.petId)],
);

/**
 * Medical timeline records for each pet.
 */
export const medicalRecords = pgTable(
  'medical_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 180 }).notNull(),
    description: text('description'),
    date: varchar('date', { length: 30 }).notNull(),
    vetName: varchar('vet_name', { length: 180 }),
    attachmentsJson: text('attachments_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_medical_records_pet_id').on(table.petId),
    index('idx_medical_records_date').on(table.date),
  ],
);
