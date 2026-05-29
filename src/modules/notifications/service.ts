import { ValidationError } from '@/shared/errors';
import { getFirebaseMessaging } from '@/shared/integrations/firebase-auth';
import { NotificationsModel } from './model';

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

    const messaging = getFirebaseMessaging();
    let successCount = 0;
    let failureCount = 0;
    const invalidTokens: string[] = [];

    for (const part of chunk(tokens, 500)) {
      const res = await messaging.sendEachForMulticast({
        tokens: part,
        notification: { title: payload.title, body: payload.body },
        data: normalizeData(payload.data),
      });
      successCount += res.successCount;
      failureCount += res.failureCount;
      res.responses.forEach((r, i) => {
        if (!r.success) {
          const code = (r.error as any)?.code;
          if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
            invalidTokens.push(part[i]);
          }
        }
      });
    }

    if (invalidTokens.length) await NotificationsModel.deactivateTokens(invalidTokens);

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
};
