import { ValidationError } from '@/shared/errors';
import { PUSH_CHANNELS, sendPushToTokens, type PushChannel } from '@/shared/integrations/firebase';
import { AdminNotificationsModel, NotificationsModel } from './model';
import { categoryForType, type NotificationPriority } from './preferences';

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
  type?: string;
  /** Drives the Android channel and the APNs interruption level. */
  priority?: NotificationPriority;
};

/** Which channel a payload should land on. */
const channelFor = (payload: PushPayload): PushChannel => {
  if (payload.priority === 'critical') return PUSH_CHANNELS.critical;
  if (payload.priority === 'low') return PUSH_CHANNELS.quiet;
  return categoryForType(payload.type) === 'task' ? PUSH_CHANNELS.tasks : PUSH_CHANNELS.default;
};

/**
 * Action set for the notification, matching the categories the app registers.
 *
 * Only a notification about exactly one task can offer "Done" / "Snooze" —
 * `taskId` is present precisely in that case, and a bundle deliberately omits
 * it because neither button would have an unambiguous target.
 */
export const TASK_ACTION_CATEGORY = 'careleo-task';

const categoryIdFor = (payload: PushPayload): string | undefined =>
  payload.data?.taskId && categoryForType(payload.type) === 'task' ? TASK_ACTION_CATEGORY : undefined;

const normalizeData = (data: unknown): Record<string, string> => {
  if (!data || typeof data !== 'object') return {};
  return Object.fromEntries(Object.entries(data as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
};

const chunk = <T>(items: T[], size = 500): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
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

  /**
   * Raw sender — no preference checks. Admin sends use this directly; every
   * system-generated notification should go through `deliverToUser` instead so
   * quiet hours and category toggles are honoured.
   *
   * `recordInApp: false` skips the in-app history row, for the second half of a
   * deferred delivery whose row was already written when it was deferred.
   */
  async sendToUsers(
    userIds: string[],
    payload: PushPayload,
    meta: { targetMode: 'single' | 'custom' | 'all'; createdBy?: string; recordInApp?: boolean },
  ) {
    if (!payload.title?.trim() || !payload.body?.trim()) throw new ValidationError('title and body are required');
    if (!userIds.length) return { sent: 0, failed: 0, users: 0, message: 'No users to notify' };

    const rows = await NotificationsModel.getActiveTokensByUserIds(userIds);
    if (!rows.length) return { sent: 0, failed: 0, users: userIds.length, message: 'No active device token found' };

    // Android is sent data-only so the app draws the notification itself and
    // can attach Done / Snooze; iOS keeps the OS-drawn notification and gets
    // its actions from the APNs category.
    const androidTokens = rows.filter((r) => r.platform === 'android').map((r) => r.fcmToken);
    const otherTokens = rows.filter((r) => r.platform !== 'android').map((r) => r.fcmToken);

    let successCount = 0;
    let failureCount = 0;
    const invalidTokens: string[] = [];

    const base = {
      title: payload.title,
      body: payload.body,
      data: normalizeData(payload.data),
      channelId: channelFor(payload),
      critical: payload.priority === 'critical',
      categoryId: categoryIdFor(payload),
    };

    const send = async (tokens: string[], dataOnly: boolean) => {
      for (const part of chunk(tokens, 500)) {
        const res = await sendPushToTokens(part, { ...base, dataOnly });
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
    };

    await send(androidTokens, true);
    await send(otherTokens, false);

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

    if (meta.recordInApp !== false) {
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
    }

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

  async deleteNotification(id: string, userId: string) {
    const row = await NotificationsModel.deleteNotification(id, userId);
    if (!row) throw new ValidationError('Notification not found');
    return { success: true, id: row.id };
  },

  async deleteAllNotifications(userId: string, readOnly = false) {
    const deleted = await NotificationsModel.deleteAllNotifications(userId, readOnly);
    return { success: true, deleted };
  },

  // ── Admin notification feed ──────────────────────────────────

  async adminFeed(adminId: string, limit = 30) {
    // The whole window is fetched regardless of `limit` so the bell badge is
    // an honest total — `limit` only trims what is rendered.
    const [events, readKeys] = await Promise.all([
      AdminNotificationsModel.listFeedEvents(),
      AdminNotificationsModel.listReadKeys(adminId),
    ]);

    const notifications = events.slice(0, limit).map((e) => ({
      id: e.key,
      type: e.type,
      title: e.title,
      body: e.body,
      href: e.href,
      severity: e.severity,
      createdAt: e.createdAt,
      isRead: readKeys.has(e.key),
    }));

    return {
      notifications,
      unreadCount: events.filter((e) => !readKeys.has(e.key)).length,
    };
  },

  async markAdminNotificationRead(adminId: string, eventKey: string) {
    const key = String(eventKey ?? '').trim();
    if (!key) throw new ValidationError('notification id is required');
    await AdminNotificationsModel.markRead(adminId, [key]);
    return { success: true, id: key };
  },

  async markAllAdminNotificationsRead(adminId: string) {
    // Only the events currently in the feed can be marked read — anything
    // older has already aged out of the window.
    const events = await AdminNotificationsModel.listFeedEvents();
    const marked = await AdminNotificationsModel.markRead(
      adminId,
      events.map((e) => e.key),
    );
    void AdminNotificationsModel.pruneReadMarkers(adminId).catch(() => {});
    return { success: true, marked };
  },
};
