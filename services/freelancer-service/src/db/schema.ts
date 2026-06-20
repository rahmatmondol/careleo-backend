import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  numeric,
  integer,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core';

// ─── Freelancer identity (owned by this service) ───────────────────────────
export const freelancerAccounts = pgTable('freelancer_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 30 }),
  // pending (new) | active | suspended
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── Freelancer profile (1:1 with account) ────────────────────────────────
export const freelancerProfiles = pgTable('freelancer_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').references(() => freelancerAccounts.id, { onDelete: 'cascade' }).notNull().unique(),
  bio: text('bio'),
  location: varchar('location', { length: 200 }),
  // e.g. ["walking","grooming","training"]
  serviceTypes: jsonb('service_types').$type<string[]>().default([]),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  rating: numeric('rating', { precision: 3, scale: 2 }).default('0'),
  ratingCount: integer('rating_count').default(0).notNull(),
  totalEarnings: numeric('total_earnings', { precision: 10, scale: 2 }).default('0'),
  isVerified: boolean('is_verified').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── Freelancer gigs (Fiverr-style listings) ──────────────────────────────
export const freelancerServices = pgTable('freelancer_services', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileId: uuid('profile_id').references(() => freelancerProfiles.id, { onDelete: 'cascade' }).notNull(),
  // walking | sitting | grooming | training | poop_scooping | other
  serviceType: varchar('service_type', { length: 50 }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  // per_walk | hourly | daily | monthly
  billingPeriod: varchar('billing_period', { length: 20 }).default('per_walk').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  // pending (new) | approved (visible) | hidden (taken down)
  moderationStatus: varchar('moderation_status', { length: 20 }).default('pending').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── Jobs (hiring / job letters) ──────────────────────────────────────────
export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  // customerId is a careleo-backend user id (no FK — cross-service)
  customerId: uuid('customer_id').notNull(),
  customerEmail: varchar('customer_email', { length: 255 }).notNull(),
  petId: uuid('pet_id').notNull(),
  petName: varchar('pet_name', { length: 100 }),
  profileId: uuid('profile_id').references(() => freelancerProfiles.id).notNull(),
  serviceId: uuid('service_id').references(() => freelancerServices.id),
  message: text('message'),
  proposedSchedule: varchar('proposed_schedule', { length: 500 }),
  agreedPrice: numeric('agreed_price', { precision: 10, scale: 2 }),
  // sent | accepted | declined | cancelled | completed
  status: varchar('status', { length: 20 }).default('sent').notNull(),
  // manual (customer-initiated) | auto (AI auto-hire)
  mode: varchar('mode', { length: 10 }).default('manual').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  respondedAt: timestamp('responded_at'),
  completedAt: timestamp('completed_at'),
});

// ─── Bookings (created when a job is accepted) ────────────────────────────
export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'cascade' }).notNull().unique(),
  customerId: uuid('customer_id').notNull(),
  profileId: uuid('profile_id').references(() => freelancerProfiles.id).notNull(),
  scheduleAt: timestamp('schedule_at'),
  // scheduled | in_progress | completed | cancelled
  status: varchar('status', { length: 20 }).default('scheduled').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── Booking reviews ──────────────────────────────────────────────────────
export const bookingReviews = pgTable('booking_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }).notNull().unique(),
  customerId: uuid('customer_id').notNull(),
  profileId: uuid('profile_id').references(() => freelancerProfiles.id).notNull(),
  rating: integer('rating').notNull(), // 1-5
  comment: text('comment'),
  // active | hidden (moderation)
  status: varchar('status', { length: 20 }).default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Earnings ─────────────────────────────────────────────────────────────
export const earnings = pgTable('earnings', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileId: uuid('profile_id').references(() => freelancerProfiles.id).notNull(),
  jobId: uuid('job_id').references(() => jobs.id).notNull().unique(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  platformFeePct: numeric('platform_fee_pct', { precision: 5, scale: 2 }).default('10'),
  platformFee: numeric('platform_fee', { precision: 10, scale: 2 }).notNull(),
  netAmount: numeric('net_amount', { precision: 10, scale: 2 }).notNull(),
  // pending | paid | failed | on_hold
  payoutStatus: varchar('payout_status', { length: 20 }).default('pending').notNull(),
  payoutRef: varchar('payout_ref', { length: 200 }),
  paidAt: timestamp('paid_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Support tickets ──────────────────────────────────────────────────────
export const supportTickets = pgTable('support_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  raisedBy: uuid('raised_by').notNull(),
  // customer | freelancer
  raiserRole: varchar('raiser_role', { length: 20 }).notNull(),
  subject: varchar('subject', { length: 300 }).notNull(),
  // payment | service | account | other
  category: varchar('category', { length: 50 }).default('other').notNull(),
  relatedJobId: uuid('related_job_id'),
  // open | in_progress | resolved | closed
  status: varchar('status', { length: 20 }).default('open').notNull(),
  // low | medium | high
  priority: varchar('priority', { length: 20 }).default('medium').notNull(),
  assignedTo: uuid('assigned_to'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const supportMessages = pgTable('support_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id').references(() => supportTickets.id, { onDelete: 'cascade' }).notNull(),
  senderId: uuid('sender_id').notNull(),
  // customer | freelancer | admin | support
  senderRole: varchar('sender_role', { length: 20 }).notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
