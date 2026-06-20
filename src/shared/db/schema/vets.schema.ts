import { index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './auth';

/** Vet directory master table. */
export const vets = pgTable(
  'vets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fullName: varchar('full_name', { length: 180 }).notNull(),
    bio: text('bio'),
    specialty: varchar('specialty', { length: 120 }),
    location: varchar('location', { length: 180 }),
    rating: varchar('rating', { length: 10 }).default('0'),
    consultationFee: varchar('consultation_fee', { length: 40 }),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_vets_specialty').on(table.specialty), index('idx_vets_location').on(table.location)],
);

/** Services offered by vets (e.g., vaccination, surgery, teleconsult). */
export const vetServices = pgTable(
  'vet_services',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    vetId: uuid('vet_id')
      .notNull()
      .references(() => vets.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description'),
    fee: varchar('fee', { length: 40 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_vet_services_vet_id').on(table.vetId)],
);

/** Availability slots published by vets. */
export const vetAvailability = pgTable(
  'vet_availability',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    vetId: uuid('vet_id')
      .notNull()
      .references(() => vets.id, { onDelete: 'cascade' }),
    dayOfWeek: varchar('day_of_week', { length: 20 }).notNull(),
    startTime: varchar('start_time', { length: 20 }).notNull(),
    endTime: varchar('end_time', { length: 20 }).notNull(),
    mode: varchar('mode', { length: 20 }).default('both'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_vet_availability_vet_id').on(table.vetId)],
);

/** User reviews for vets. */
export const vetReviews = pgTable(
  'vet_reviews',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    vetId: uuid('vet_id')
      .notNull()
      .references(() => vets.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: varchar('rating', { length: 10 }).notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_vet_reviews_vet_id').on(table.vetId), index('idx_vet_reviews_user_id').on(table.userId)],
);

/** Appointment bookings for video/physical visits. */
export const vetAppointments = pgTable(
  'vet_appointments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    vetId: uuid('vet_id')
      .notNull()
      .references(() => vets.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    petId: uuid('pet_id'),
    type: varchar('type', { length: 20 }).notNull(),
    status: varchar('status', { length: 30 }).notNull().default('scheduled'),
    appointmentAt: varchar('appointment_at', { length: 40 }).notNull(),
    reason: text('reason'),
    notes: text('notes'),
    callToken: text('call_token'),
    followUpAt: varchar('follow_up_at', { length: 40 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_vet_appointments_vet_id').on(table.vetId),
    index('idx_vet_appointments_user_id').on(table.userId),
    index('idx_vet_appointments_status').on(table.status),
  ],
);

/** Prescriptions generated from appointments. */
export const vetPrescriptions = pgTable(
  'vet_prescriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    appointmentId: uuid('appointment_id')
      .notNull()
      .references(() => vetAppointments.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    vetId: uuid('vet_id')
      .notNull()
      .references(() => vets.id, { onDelete: 'cascade' }),
    medicinesJson: text('medicines_json').notNull(),
    instructions: text('instructions'),
    refillCount: varchar('refill_count', { length: 10 }).default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_vet_prescriptions_user_id').on(table.userId), index('idx_vet_prescriptions_vet_id').on(table.vetId)],
);
