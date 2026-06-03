import { ValidationError } from '@/shared/errors';
import { sendPushToTokens } from '@/shared/integrations/firebase';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import { NotificationsModel } from './model';
import { pets, reminders, tasks } from '@/shared/db/schema';

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
  type?: string;
};

const normalizeData = (data: unknown): Record<string, string> => {
  if (!data || typeof data !== 'object') return {};
  return Object.fromEntries(Object.entries(data as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
};

const chunk = <T>(items: T[], size = 500): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const getSchedulerState = () => {
  const g = globalThis as any;
  if (!g.__careleoScheduler) g.__careleoScheduler = { started: false, intervalId: null as any };
  return g.__careleoScheduler as { started: boolean; intervalId: any };
};

const parseTimeToMinutes = (input: string): number | null => {
  const raw = input.trim();
  if (!raw) return null;

  const match12h = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match12h) {
    let h = Number(match12h[1]);
    const m = Number(match12h[2]);
    const meridian = match12h[3].toUpperCase();
    if (Number.isNaN(h) || Number.isNaN(m) || m < 0 || m > 59 || h < 1 || h > 12) return null;
    if (meridian === 'PM' && h !== 12) h += 12;
    if (meridian === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  }

  const match24h = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (match24h) {
    const h = Number(match24h[1]);
    const m = Number(match24h[2]);
    if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h * 60 + m;
  }

  return null;
};

const parseDateOnly = (input: string): Date | null => {
  const raw = input.trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const date = new Date(y, mo, d);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d) return null;
  return date;
};

const getFrequency = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const sameLocalDate = (a: Date, b: Date) => {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
};

const shouldFireReminderNow = (payload: { frequency?: string | null; reminderDate?: string | null; reminderTime?: string | null }, now: Date): boolean => {
  const time = parseTimeToMinutes(String(payload.reminderTime ?? '').trim());
  if (time === null) return false;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const diff = (nowMinutes - time + 1440) % 1440;
  if (diff !== 0 && diff !== 1) return false;

  const freq = getFrequency(payload.frequency);
  const dateOnly = payload.reminderDate ? parseDateOnly(String(payload.reminderDate)) : null;
  const nowForRule = diff === 1 ? new Date(now.getTime() - 60_000) : now;

  if (freq.includes('once') || freq.includes('one')) {
    if (!dateOnly) return true;
    return sameLocalDate(nowForRule, dateOnly);
  }

  if (freq.includes('weekly')) {
    if (!dateOnly) return true;
    return nowForRule.getDay() === dateOnly.getDay();
  }

  if (freq.includes('monthly')) {
    if (!dateOnly) return true;
    return nowForRule.getDate() === dateOnly.getDate();
  }

  return true;
};

const notificationLoggedRecently = async (type: string, key: string, since: Date) => {
  try {
    const result = await db.execute(
      sql`select id from notification_logs where type = ${type} and data_json like ${`%${key}%`} and created_at >= ${since} limit 1`,
    );
    const row = (result as any)?.rows?.[0];
    return Boolean(row?.id);
  } catch {
    return false;
  }
};

export const NotificationsService = {
  async registerDeviceToken(userId: string, payload: Record<string, unknown>) {
    const fcmToken = String(payload.fcmToken ?? '').trim();
    const platform = String(payload.platform ?? '').trim().toLowerCase();
    const appVersion = String(payload.appVersion ?? '').trim();

    if (!fcmToken || !platform) throw new ValidationError('fcmToken and platform are required');
    if (!['android', 'ios', 'web'].includes(platform)) throw new ValidationError('platform must be android, ios, or web');

    const token = await NotificationsModel.upsertDeviceToken({
      userId,
      fcmToken,
      platform,
      appVersion: appVersion || undefined,
    });

    return { id: token?.id, fcmToken, platform, isActive: true };
  },

  async removeDeviceToken(userId: string, payload: Record<string, unknown>) {
    const fcmToken = String(payload.fcmToken ?? '').trim();
    if (!fcmToken) throw new ValidationError('fcmToken is required');

    await NotificationsModel.deactivateDeviceToken(userId, fcmToken);
    return { removed: true, fcmToken };
  },

  async sendToUsers(userIds: string[], payload: PushPayload, meta: { targetMode: 'single' | 'custom' | 'all'; createdBy?: string }) {
    if (!payload.title?.trim() || !payload.body?.trim()) throw new ValidationError('title and body are required');
    if (!userIds.length) return { sent: 0, failed: 0, users: 0, message: 'No users to notify' };

    const rows = await NotificationsModel.getActiveTokensByUserIds(userIds);
    const tokens = rows.map((r) => r.fcmToken);
    if (!tokens.length) return { sent: 0, failed: 0, users: userIds.length, message: 'No active device token found' };
    let successCount = 0;
    let failureCount = 0;
    const invalidTokens: string[] = [];

    for (const part of chunk(tokens, 500)) {
      const res = await sendPushToTokens(part, { title: payload.title, body: payload.body, data: normalizeData(payload.data) });
      successCount += res.successCount;
      failureCount += res.failureCount;
      const responses = ((res as any)?.responses ?? []) as Array<{ success: boolean; error?: unknown }>;
      responses.forEach((r, i) => {
        if (!r?.success) {
          const code = (r as any)?.error?.code;
          if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
            invalidTokens.push(part[i]);
          }
        }
      });
    }

    if (invalidTokens.length) await NotificationsModel.deactivateTokens(invalidTokens);

    try {
      await NotificationsModel.createLog({
        type: payload.type ?? 'ADMIN_CUSTOM',
        title: payload.title,
        body: payload.body,
        dataJson: JSON.stringify(payload.data ?? {}),
        targetMode: meta.targetMode,
        targetUserIds: JSON.stringify(userIds),
        status: failureCount > 0 ? (successCount > 0 ? 'partial' : 'failed') : 'sent',
        successCount,
        failureCount,
        createdBy: meta.createdBy,
      });
    } catch {}

    try {
      for (const uid of userIds) {
        await NotificationsModel.insertUserNotification({
          userId: uid,
          type: payload.type ?? 'SYSTEM',
          title: payload.title,
          body: payload.body,
          dataJson: JSON.stringify(payload.data ?? {}),
        });
      }
    } catch {}

    return { sent: successCount, failed: failureCount, users: userIds.length };
  },

  async sendToAll(payload: PushPayload, createdBy?: string) {
    const users = await NotificationsModel.listAllUserIds();
    const ids = users.map((u) => u.id);
    return this.sendToUsers(ids, payload, { targetMode: 'all', createdBy });
  },

  async sendAdminSingle(adminId: string, payload: Record<string, unknown>) {
    const userId = String(payload.userId ?? '').trim();
    if (!userId) throw new ValidationError('userId is required');
    return this.sendToUsers(
      [userId],
      { title: String(payload.title ?? ''), body: String(payload.body ?? ''), data: normalizeData(payload.data), type: 'ADMIN_CUSTOM' },
      { targetMode: 'single', createdBy: adminId },
    );
  },

  async sendAdminCustomList(adminId: string, payload: Record<string, unknown>) {
    const userIds = Array.isArray(payload.userIds) ? payload.userIds.map((x) => String(x).trim()).filter(Boolean) : [];
    if (!userIds.length) throw new ValidationError('userIds is required');
    return this.sendToUsers(
      userIds,
      { title: String(payload.title ?? ''), body: String(payload.body ?? ''), data: normalizeData(payload.data), type: 'ADMIN_CUSTOM' },
      { targetMode: 'custom', createdBy: adminId },
    );
  },

  async sendAdminBroadcast(adminId: string, payload: Record<string, unknown>) {
    return this.sendToAll(
      { title: String(payload.title ?? ''), body: String(payload.body ?? ''), data: normalizeData(payload.data), type: 'ADMIN_CUSTOM' },
      adminId,
    );
  },

  async logList(limit = 50) {
    return { logs: await NotificationsModel.listLogs(limit) };
  },

  // ── User-facing notification methods ─────────────────────

  async listUserNotifications(userId: string, limit = 50, cursor?: string) {
    return NotificationsModel.listUserNotifications(userId, limit, cursor);
  },

  async countUnreadNotifications(userId: string) {
    const count = await NotificationsModel.countUnreadNotifications(userId);
    return { unreadCount: count };
  },

  async markNotificationRead(id: string, userId: string) {
    const row = await NotificationsModel.markNotificationRead(id, userId);
    if (!row) throw new ValidationError('Notification not found');
    return { notification: row };
  },

  async markAllNotificationsRead(userId: string) {
    await NotificationsModel.markAllNotificationsRead(userId);
    return { success: true };
  },
};

export const startTaskReminderPushScheduler = () => {
  const state = getSchedulerState();
  if (state.started) return;
  state.started = true;

  const tick = async () => {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 5 * 60_000);
    const windowEnd = new Date(now.getTime() + 2 * 60_000);

    try {
      const dueTasks = await db
        .select({
          id: tasks.id,
          userId: tasks.userId,
          title: tasks.title,
          taskType: tasks.taskType,
          petId: tasks.petId,
          petName: pets.name,
          dueDate: tasks.dueDate,
        })
        .from(tasks)
        .innerJoin(pets, eq(tasks.petId, pets.id))
        .where(and(eq(tasks.isCompleted, false), gte(tasks.dueDate, windowStart), lte(tasks.dueDate, windowEnd)));

      for (const t of dueTasks) {
        const key = `"taskId":"${t.id}"`;
        const already = await notificationLoggedRecently('TASK_DUE', key, new Date(now.getTime() - 6 * 60 * 60 * 1000));
        if (already) continue;
        try {
          const petName = String(t.petName ?? '');
          const taskType = String(t.taskType ?? '').toLowerCase();
          await NotificationsService.sendToUsers(
            [t.userId],
            {
              title: petName ? `Time for ${petName}'s ${taskType}` : `"${String(t.title)}" is due now`,
              body: `"${String(t.title)}" is due now`,
              data: { taskId: String(t.id), event: 'task_due' },
              type: 'TASK_DUE',
            },
            { targetMode: 'single' },
          );
        } catch {}
      }
    } catch {}

    try {
      const activeReminders = await db
        .select({
          id: reminders.id,
          userId: reminders.userId,
          title: reminders.title,
          frequency: reminders.frequency,
          reminderDate: reminders.reminderDate,
          reminderTime: reminders.reminderTime,
        })
        .from(reminders)
        .where(and(eq(reminders.isActive, true), eq(reminders.isCompleted, false)));

      for (const r of activeReminders) {
        if (!shouldFireReminderNow(r, now)) continue;
        const key = `"reminderId":"${r.id}"`;
        const already = await notificationLoggedRecently('REMINDER_DUE', key, new Date(now.getTime() - 6 * 60 * 60 * 1000));
        if (already) continue;
        try {
          await NotificationsService.sendToUsers(
            [r.userId],
            {
              title: 'Reminder',
              body: `${r.title}`,
              data: { reminderId: String(r.id), event: 'reminder_due' },
              type: 'REMINDER_DUE',
            },
            { targetMode: 'single' },
          );
        } catch {}
      }
    } catch {}
  };

  void tick();
  state.intervalId = setInterval(() => void tick(), 60_000);
};
