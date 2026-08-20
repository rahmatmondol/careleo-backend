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
    /**
     * The rest of what the owner actually saw and was told. Only the three
     * columns above were kept, so the history screen could not show a report
     * back the way it was given, and a chat opened from a report had nothing
     * but a one-line concern to work from.
     */
    /** What the vision model described in the attached photo. JSON string[]. */
    observationsJson: text('observations_json'),
    /** Answers to the generated follow-up questions. JSON {q,a}[]. */
    answersJson: text('answers_json'),
    /** Why this pet's breed, age or history mattered. */
    breedNote: text('breed_note'),
    /** Prose from the web-grounded research pass. */
    research: text('research'),
    /** Pages that research cited. JSON {title,uri}[]. */
    sourcesJson: text('sources_json'),
    /** 'ai' | 'critical-sign' | 'offline' — how this report was produced. */
    source: varchar('source', { length: 20 }).notNull().default('ai'),
    /** Chat opened from this report, if the owner asked CareLeo about it. */
    chatSessionId: uuid('chat_session_id'),
    /** When to ask how the pet is doing. Null = no follow-up wanted. */
    followUpAt: timestamp('follow_up_at', { withTimezone: true }),
    followedUpAt: timestamp('followed_up_at', { withTimezone: true }),
    /** Set once the owner tells us it cleared up, or a vet visit happened. */
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    /**
     * What the owner said when asked how the pet is doing. The follow-up job
     * asks the question; without somewhere to put the answer the loop stayed
     * half-open — the assistant re-read the original symptoms every time and
     * never knew whether anything had changed since.
     */
    ownerUpdate: text('owner_update'),
    ownerUpdateAt: timestamp('owner_update_at', { withTimezone: true }),
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
