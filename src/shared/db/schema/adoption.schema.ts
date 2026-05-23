import { index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './auth';

/** Adoption shelters directory. */
export const adoptionShelters = pgTable(
  'adoption_shelters',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 180 }).notNull(),
    city: varchar('city', { length: 120 }),
    state: varchar('state', { length: 120 }),
    country: varchar('country', { length: 120 }),
    address: text('address'),
    phone: varchar('phone', { length: 80 }),
    email: varchar('email', { length: 180 }),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_adoption_shelters_name').on(table.name)],
);

/** Pets available for adoption. */
export const adoptionPets = pgTable(
  'adoption_pets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    shelterId: uuid('shelter_id').references(() => adoptionShelters.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 160 }).notNull(),
    type: varchar('type', { length: 80 }).notNull(),
    breed: varchar('breed', { length: 160 }),
    gender: varchar('gender', { length: 30 }),
    age: varchar('age', { length: 60 }),
    size: varchar('size', { length: 40 }),
    color: varchar('color', { length: 120 }),
    description: text('description'),
    photoUrl: text('photo_url'),
    status: varchar('status', { length: 30 }).notNull().default('available'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_adoption_pets_status').on(table.status), index('idx_adoption_pets_type').on(table.type)],
);

/** Adoption applications submitted by users. */
export const adoptionApplications = pgTable(
  'adoption_applications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    petId: uuid('pet_id')
      .notNull()
      .references(() => adoptionPets.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    message: text('message'),
    status: varchar('status', { length: 30 }).notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_adoption_applications_pet_id').on(table.petId),
    index('idx_adoption_applications_user_id').on(table.userId),
    index('idx_adoption_applications_status').on(table.status),
  ],
);

/** Saved compatibility quiz answers/results by user. */
export const adoptionQuizResults = pgTable(
  'adoption_quiz_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    answersJson: text('answers_json').notNull(),
    recommendedType: varchar('recommended_type', { length: 80 }),
    score: varchar('score', { length: 30 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_adoption_quiz_user_id').on(table.userId)],
);
