import { boolean, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './auth';

/**
 * Per-user notification settings.
 *
 * A row is created lazily — absence means "all defaults", so every existing
 * user keeps working without a backfill. `DEFAULT_PREFERENCES` in
 * `modules/notifications/preferences.ts` is the single source of truth for what
 * those defaults are; the column defaults here only matter for rows written by
 * hand.
 *
 * Quiet hours are stored as `HH:mm` wall-clock strings and evaluated in the
 * user's own `users.timezone`, not the server's.
 */
export const notificationPreferences = pgTable('notification_preferences', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),

  /** Master switch. Off = no push at all; in-app history is still written. */
  pushEnabled: boolean('push_enabled').notNull().default(true),

  // ── Per-category toggles ──────────────────────────────────────────────
  taskEnabled: boolean('task_enabled').notNull().default(true),
  healthEnabled: boolean('health_enabled').notNull().default(true),
  aiEnabled: boolean('ai_enabled').notNull().default(true),
  shopEnabled: boolean('shop_enabled').notNull().default(true),
  socialEnabled: boolean('social_enabled').notNull().default(true),

  // ── Quiet hours ───────────────────────────────────────────────────────
  quietHoursEnabled: boolean('quiet_hours_enabled').notNull().default(true),
  quietStart: varchar('quiet_start', { length: 5 }).notNull().default('22:00'),
  quietEnd: varchar('quiet_end', { length: 5 }).notNull().default('07:00'),
  /** Medication/vaccine-grade alerts ignore quiet hours when this is on. */
  criticalBypassQuiet: boolean('critical_bypass_quiet').notNull().default(true),

  // ── Volume control ────────────────────────────────────────────────────
  /** Bundle everything due in the same 10-minute slot into one push. */
  digestEnabled: boolean('digest_enabled').notNull().default(true),
  /**
   * How many follow-up pushes an unfinished task may trigger before the app
   * stops pushing and hands the thread to the AI chat. 0 = never nag.
   */
  taskEscalationLimit: integer('task_escalation_limit').notNull().default(2),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
