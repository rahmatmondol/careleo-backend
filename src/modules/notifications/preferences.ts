/**
 * Notification preferences: what a user is willing to be pushed, and when.
 *
 * Every system-generated push goes through `resolveDelivery` before it reaches
 * FCM. Three outcomes only:
 *
 *   send     — deliver now
 *   defer    — inside quiet hours; deliver at the end of the quiet window
 *   suppress — the user turned this category (or push entirely) off
 *
 * A suppressed push still writes the in-app notification row, so nothing is
 * lost from the bell/history — the user just doesn't get buzzed.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/shared/db';
import { users } from '@/shared/db/schema';
import { notificationPreferences } from '@/shared/db/schema/notification-preferences.schema';
import { ValidationError } from '@/shared/errors';
import { isIanaZone, minutesInZone, parseHhMm } from '@/shared/types/timezone';

export type NotificationCategory = 'task' | 'health' | 'ai' | 'shop' | 'social' | 'system';
export type NotificationPriority = 'critical' | 'normal' | 'low';

export type NotificationPreferences = {
  pushEnabled: boolean;
  taskEnabled: boolean;
  healthEnabled: boolean;
  aiEnabled: boolean;
  shopEnabled: boolean;
  socialEnabled: boolean;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  criticalBypassQuiet: boolean;
  digestEnabled: boolean;
  taskEscalationLimit: number;
};

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  pushEnabled: true,
  taskEnabled: true,
  healthEnabled: true,
  aiEnabled: true,
  shopEnabled: true,
  socialEnabled: true,
  quietHoursEnabled: true,
  quietStart: '22:00',
  quietEnd: '07:00',
  criticalBypassQuiet: true,
  digestEnabled: true,
  taskEscalationLimit: 2,
};

export const FALLBACK_TZ = process.env.APP_DEFAULT_TIMEZONE || 'Asia/Dhaka';

/**
 * Notification `type` → category.
 *
 * Anything unmapped falls into `system`, which is only gated by the master
 * switch. That is deliberate: a new notification type should never be silently
 * swallowed because nobody remembered to register it here.
 */
const CATEGORY_BY_TYPE: Record<string, NotificationCategory> = {
  TASK_DUE: 'task',
  TASK_DIGEST: 'task',
  TASK_REMINDER: 'task',
  TASK_OVERDUE: 'task',
  REMINDER_DUE: 'task',

  VACCINE_DUE: 'health',
  HEALTH_ALERT: 'health',
  MEDICATION: 'health',
  VET_APPOINTMENT: 'health',

  AI_ASSISTANT: 'ai',
  AI_CHECKIN: 'ai',
  AI_NUDGE: 'ai',

  LOW_STOCK: 'shop',
  AUTO_REORDER: 'shop',
  ORDER_UPDATE: 'shop',

  SOCIAL_LIKE: 'social',
  SOCIAL_COMMENT: 'social',
  SOCIAL_FOLLOW: 'social',
};

export const categoryForType = (type?: string): NotificationCategory =>
  CATEGORY_BY_TYPE[String(type ?? '').toUpperCase()] ?? 'system';

const ENABLED_KEY: Record<NotificationCategory, keyof NotificationPreferences | null> = {
  task: 'taskEnabled',
  health: 'healthEnabled',
  ai: 'aiEnabled',
  shop: 'shopEnabled',
  social: 'socialEnabled',
  system: null,
};

/**
 * Task types that are allowed to wake somebody up.
 *
 * A missed dose is not the same event as a missed play session, and treating
 * them identically is what made the old ladder feel like spam.
 */
const CRITICAL_TASK_TYPES = new Set([
  'MEDICINE',
  'MEDICATION',
  'MEDICAL',
  'VACCINE',
  'VACCINATION',
  'INSULIN',
  'TREATMENT',
]);

export const priorityForTaskType = (taskType?: string | null): NotificationPriority =>
  CRITICAL_TASK_TYPES.has(String(taskType ?? '').trim().toUpperCase()) ? 'critical' : 'normal';

// ── Loading ────────────────────────────────────────────────────────────────

type CachedContext = { prefs: NotificationPreferences; timezone: string; at: number };

const CACHE_TTL_MS = 15_000;
const cache = new Map<string, CachedContext>();

export const invalidatePreferences = (userId: string) => cache.delete(userId);

/** Preferences + the clock they should be evaluated against. */
export const getPreferenceContext = async (
  userId: string,
): Promise<{ prefs: NotificationPreferences; timezone: string }> => {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { prefs: hit.prefs, timezone: hit.timezone };

  const [row] = await db
    .select({
      tz: users.timezone,
      pushEnabled: notificationPreferences.pushEnabled,
      taskEnabled: notificationPreferences.taskEnabled,
      healthEnabled: notificationPreferences.healthEnabled,
      aiEnabled: notificationPreferences.aiEnabled,
      shopEnabled: notificationPreferences.shopEnabled,
      socialEnabled: notificationPreferences.socialEnabled,
      quietHoursEnabled: notificationPreferences.quietHoursEnabled,
      quietStart: notificationPreferences.quietStart,
      quietEnd: notificationPreferences.quietEnd,
      criticalBypassQuiet: notificationPreferences.criticalBypassQuiet,
      digestEnabled: notificationPreferences.digestEnabled,
      taskEscalationLimit: notificationPreferences.taskEscalationLimit,
    })
    .from(users)
    .leftJoin(notificationPreferences, eq(notificationPreferences.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  // No preferences row (the common case) leaves every joined column null, so
  // fall back key by key rather than testing for the row itself.
  const prefs: NotificationPreferences = {
    pushEnabled: row?.pushEnabled ?? DEFAULT_PREFERENCES.pushEnabled,
    taskEnabled: row?.taskEnabled ?? DEFAULT_PREFERENCES.taskEnabled,
    healthEnabled: row?.healthEnabled ?? DEFAULT_PREFERENCES.healthEnabled,
    aiEnabled: row?.aiEnabled ?? DEFAULT_PREFERENCES.aiEnabled,
    shopEnabled: row?.shopEnabled ?? DEFAULT_PREFERENCES.shopEnabled,
    socialEnabled: row?.socialEnabled ?? DEFAULT_PREFERENCES.socialEnabled,
    quietHoursEnabled: row?.quietHoursEnabled ?? DEFAULT_PREFERENCES.quietHoursEnabled,
    quietStart: row?.quietStart ?? DEFAULT_PREFERENCES.quietStart,
    quietEnd: row?.quietEnd ?? DEFAULT_PREFERENCES.quietEnd,
    criticalBypassQuiet: row?.criticalBypassQuiet ?? DEFAULT_PREFERENCES.criticalBypassQuiet,
    digestEnabled: row?.digestEnabled ?? DEFAULT_PREFERENCES.digestEnabled,
    taskEscalationLimit: row?.taskEscalationLimit ?? DEFAULT_PREFERENCES.taskEscalationLimit,
  };
  const timezone = row?.tz || FALLBACK_TZ;

  cache.set(userId, { prefs, timezone, at: Date.now() });
  return { prefs, timezone };
};

// ── Quiet hours ────────────────────────────────────────────────────────────

/** Is `at` inside the user's quiet window, on their clock? */
export const isQuietNow = (prefs: NotificationPreferences, timezone: string, at: Date): boolean => {
  if (!prefs.quietHoursEnabled) return false;
  const start = parseHhMm(prefs.quietStart);
  const end = parseHhMm(prefs.quietEnd);
  if (start === null || end === null || start === end) return false;

  const now = minutesInZone(timezone, at);
  // A window that wraps midnight (22:00 → 07:00) is the normal case.
  return start < end ? now >= start && now < end : now >= start || now < end;
};

/** When the quiet window ends, as an absolute instant. */
const quietEndsAt = (prefs: NotificationPreferences, timezone: string, at: Date): Date => {
  const end = parseHhMm(prefs.quietEnd);
  if (end === null) return at;
  const now = minutesInZone(timezone, at);
  // Offsets are treated as constant across the window; a DST change inside
  // somebody's night shifts the delivery by an hour, which nobody will notice.
  const deltaMinutes = (end - now + 1440) % 1440 || 1440;
  return new Date(at.getTime() + deltaMinutes * 60_000);
};

// ── The decision ───────────────────────────────────────────────────────────

export type DeliveryDecision =
  | { push: 'send' }
  | { push: 'defer'; deferUntil: Date; reason: 'quiet_hours' }
  | { push: 'suppress'; reason: 'push_disabled' | 'category_disabled' };

export const resolveDelivery = (
  prefs: NotificationPreferences,
  timezone: string,
  opts: { type?: string; priority?: NotificationPriority; at?: Date },
): DeliveryDecision => {
  const at = opts.at ?? new Date();
  const priority = opts.priority ?? 'normal';

  if (!prefs.pushEnabled) return { push: 'suppress', reason: 'push_disabled' };

  const key = ENABLED_KEY[categoryForType(opts.type)];
  if (key && prefs[key] === false) return { push: 'suppress', reason: 'category_disabled' };

  const bypasses = priority === 'critical' && prefs.criticalBypassQuiet;
  if (!bypasses && isQuietNow(prefs, timezone, at)) {
    return { push: 'defer', deferUntil: quietEndsAt(prefs, timezone, at), reason: 'quiet_hours' };
  }

  return { push: 'send' };
};

// ── Read / write API ───────────────────────────────────────────────────────

const BOOLEAN_FIELDS = [
  'pushEnabled',
  'taskEnabled',
  'healthEnabled',
  'aiEnabled',
  'shopEnabled',
  'socialEnabled',
  'quietHoursEnabled',
  'criticalBypassQuiet',
  'digestEnabled',
] as const;

export const PreferencesService = {
  async get(userId: string) {
    const { prefs, timezone } = await getPreferenceContext(userId);
    return { preferences: prefs, timezone };
  },

  async update(userId: string, payload: Record<string, unknown>) {
    const patch: Record<string, unknown> = {};

    for (const field of BOOLEAN_FIELDS) {
      if (payload[field] !== undefined) patch[field] = Boolean(payload[field]);
    }

    for (const field of ['quietStart', 'quietEnd'] as const) {
      if (payload[field] === undefined) continue;
      const value = String(payload[field]).trim();
      if (parseHhMm(value) === null) throw new ValidationError(`${field} must be HH:mm`);
      patch[field] = value;
    }

    if (payload.taskEscalationLimit !== undefined) {
      const limit = Number(payload.taskEscalationLimit);
      if (!Number.isInteger(limit) || limit < 0 || limit > 5) {
        throw new ValidationError('taskEscalationLimit must be an integer between 0 and 5');
      }
      patch.taskEscalationLimit = limit;
    }

    // The user's clock lives on `users`, but it belongs to this screen — the
    // app sends it here so quiet hours and check-ins agree on one timezone.
    if (payload.timezone !== undefined) {
      const zone = String(payload.timezone).trim();
      if (!isIanaZone(zone)) throw new ValidationError('timezone must be a valid IANA zone');
      await db.update(users).set({ timezone: zone }).where(eq(users.id, userId));
    }

    if (Object.keys(patch).length) {
      await db
        .insert(notificationPreferences)
        .values({ userId, ...(patch as any) })
        .onConflictDoUpdate({
          target: notificationPreferences.userId,
          set: { ...(patch as any), updatedAt: new Date() },
        });
    }

    invalidatePreferences(userId);
    return this.get(userId);
  },
};
