import { index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './auth';

export const walkers = pgTable(
  'walkers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fullName: varchar('full_name', { length: 180 }).notNull(),
    bio: text('bio'),
    location: varchar('location', { length: 180 }),
    rating: varchar('rating', { length: 10 }).default('0'),
    hourlyRate: varchar('hourly_rate', { length: 40 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_walkers_location').on(table.location)],
);

export const sitters = pgTable(
  'sitters',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fullName: varchar('full_name', { length: 180 }).notNull(),
    bio: text('bio'),
    location: varchar('location', { length: 180 }),
    rating: varchar('rating', { length: 10 }).default('0'),
    dailyRate: varchar('daily_rate', { length: 40 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_sitters_location').on(table.location)],
);

export const serviceBookings = pgTable(
  'service_bookings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    providerType: varchar('provider_type', { length: 20 }).notNull(),
    providerId: uuid('provider_id').notNull(),
    petId: uuid('pet_id'),
    scheduleAt: varchar('schedule_at', { length: 40 }).notNull(),
    status: varchar('status', { length: 30 }).notNull().default('scheduled'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_service_bookings_user_id').on(table.userId),
    index('idx_service_bookings_status').on(table.status),
    index('idx_service_bookings_provider').on(table.providerType, table.providerId),
  ],
);

export const serviceBookingReviews = pgTable(
  'service_booking_reviews',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bookingId: uuid('booking_id').notNull().references(() => serviceBookings.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    rating: varchar('rating', { length: 10 }).notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_service_booking_reviews_booking_id').on(table.bookingId)],
);
