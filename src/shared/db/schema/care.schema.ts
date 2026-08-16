import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { pets } from './pets.schema';

/**
 * People other than the owner who help look after a pet.
 *
 * A caregiver is invited by email, so the invite can be sent before that person
 * has an account (`userId` stays null until they accept). Only `accepted`
 * caregivers with `alertsEnabled` are pulled into an escalation.
 */
export const petCaregivers = pgTable(
  'pet_caregivers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    /** Null while the invite is pending. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    invitedEmail: varchar('invited_email', { length: 255 }).notNull(),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    relation: varchar('relation', { length: 30 }).notNull().default('family'),
    // 'family' | 'co_owner' | 'sitter' | 'vet'
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    // 'pending' | 'accepted' | 'declined' | 'revoked'
    /** Receive the backup alert when the owner misses something critical. */
    alertsEnabled: boolean('alerts_enabled').notNull().default(true),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_pet_caregiver_email').on(table.petId, table.invitedEmail),
    index('idx_pet_caregivers_pet').on(table.petId),
    index('idx_pet_caregivers_user').on(table.userId),
    index('idx_pet_caregivers_status').on(table.status),
  ],
);

/**
 * A symptom triage the AI performed, kept so it can be followed up on.
 *
 * The assessment used to be produced and thrown away, which meant nobody ever
 * asked "is the limping any better?" two days later — the single most useful
 * question in home pet care.
 */
export const symptomReports = pgTable(
  'symptom_reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    petId: uuid('pet_id').references(() => pets.id, { onDelete: 'cascade' }),
    symptoms: text('symptoms').notNull(),
    urgency: varchar('urgency', { length: 20 }).notNull().default('medium'),
    concern: text('concern'),
    advice: text('advice'),
    shouldSeeVet: boolean('should_see_vet').notNull().default(false),
    /** When to ask how the pet is doing. Null = no follow-up wanted. */
    followUpAt: timestamp('follow_up_at', { withTimezone: true }),
    followedUpAt: timestamp('followed_up_at', { withTimezone: true }),
    /** Set once the owner tells us it cleared up, or a vet visit happened. */
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_symptom_reports_user').on(table.userId),
    index('idx_symptom_reports_pet').on(table.petId),
    index('idx_symptom_reports_follow_up').on(table.followUpAt),
  ],
);

/**
 * Ledger of age/breed milestones already acted on for a pet.
 *
 * The milestone job is idempotent through this table: one row per
 * (pet, milestone), so a puppy's 12-week booster is only ever proposed once
 * however often the job runs.
 */
export const petMilestones = pgTable(
  'pet_milestones',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    milestoneKey: varchar('milestone_key', { length: 60 }).notNull(),
    title: varchar('title', { length: 180 }).notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_pet_milestone').on(table.petId, table.milestoneKey),
    index('idx_pet_milestones_pet').on(table.petId),
  ],
);
