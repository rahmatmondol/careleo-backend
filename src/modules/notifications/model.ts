import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import { deviceTokens, notificationLogs, userNotifications, users } from '@/shared/db/schema';

export const NotificationsModel = {
  async upsertDeviceToken(payload: { userId: string; fcmToken: string; platform: string; appVersion?: string }) {
    const existing = await db
      .select({ id: deviceTokens.id })
      .from(deviceTokens)
      .where(eq(deviceTokens.fcmToken, payload.fcmToken))
      .limit(1);

    if (existing[0]) {
      const updated = await db
        .update(deviceTokens)
        .set({
          userId: payload.userId,
          platform: payload.platform,
          appVersion: payload.appVersion,
          isActive: true,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(deviceTokens.id, existing[0].id))
        .returning();
      return updated[0] ?? null;
    }

    const inserted = await db
      .insert(deviceTokens)
      .values({
        userId: payload.userId,
        fcmToken: payload.fcmToken,
        platform: payload.platform,
        appVersion: payload.appVersion,
        isActive: true,
      })
      .returning();

    return inserted[0] ?? null;
  },

  async deactivateDeviceToken(userId: string, fcmToken: string) {
    await db
      .update(deviceTokens)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.fcmToken, fcmToken)));
  },

  async deactivateTokens(tokens: string[]) {
    if (!tokens.length) return;
    await db
      .update(deviceTokens)
      .set({ isActive: false, updatedAt: new Date() })
      .where(inArray(deviceTokens.fcmToken, tokens));
  },

  async getActiveTokensByUserIds(userIds: string[]) {
    if (!userIds.length) return [] as Array<{ userId: string; fcmToken: string }>;
    return db
      .select({ userId: deviceTokens.userId, fcmToken: deviceTokens.fcmToken })
      .from(deviceTokens)
      .where(and(inArray(deviceTokens.userId, userIds), eq(deviceTokens.isActive, true)));
  },

  async getAllActiveTokens() {
    return db
      .select({ userId: deviceTokens.userId, fcmToken: deviceTokens.fcmToken })
      .from(deviceTokens)
      .where(eq(deviceTokens.isActive, true));
  },

  async listAllUserIds() {
    return db.select({ id: users.id }).from(users);
  },

  async createLog(payload: {
    type: string;
    title: string;
    body: string;
    dataJson?: string;
    targetMode: string;
    targetUserIds?: string;
    status?: string;
    successCount?: number;
    failureCount?: number;
    createdBy?: string;
  }) {
    const row = await db
      .insert(notificationLogs)
      .values({
        type: payload.type,
        title: payload.title,
        body: payload.body,
        dataJson: payload.dataJson,
        targetMode: payload.targetMode,
        targetUserIds: payload.targetUserIds,
        status: payload.status ?? 'queued',
        successCount: payload.successCount ?? 0,
        failureCount: payload.failureCount ?? 0,
        createdBy: payload.createdBy,
      })
      .returning();
    return row[0] ?? null;
  },

  async listLogs(limit = 50) {
    return db.select().from(notificationLogs).orderBy(desc(notificationLogs.createdAt)).limit(limit);
  },

  // ── User-facing notifications ─────────────────────────────────

  async insertUserNotification(payload: {
    userId: string;
    type: string;
    title: string;
    body: string;
    dataJson?: string;
  }) {
    const row = await db
      .insert(userNotifications)
      .values({
        userId: payload.userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        dataJson: payload.dataJson,
      })
      .returning();
    return row[0] ?? null;
  },

  async listUserNotifications(userId: string, limit = 50, cursor?: string) {
    const conditions = [eq(userNotifications.userId, userId)];
    if (cursor) {
      conditions.push(lt(userNotifications.createdAt, new Date(cursor)));
    }
    const rows = await db
      .select()
      .from(userNotifications)
      .where(and(...conditions))
      .orderBy(desc(userNotifications.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = items.length ? String(items[items.length - 1].createdAt) : null;

    return { notifications: items, hasMore, nextCursor };
  },

  async countUnreadNotifications(userId: string) {
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(userNotifications)
      .where(and(eq(userNotifications.userId, userId), eq(userNotifications.isRead, false)));
    return Number(rows[0]?.count ?? 0);
  },

  async markNotificationRead(id: string, userId: string) {
    const row = await db
      .update(userNotifications)
      .set({ isRead: true, readAt: new Date() })
      .where(and(eq(userNotifications.id, id), eq(userNotifications.userId, userId)))
      .returning();
    return row[0] ?? null;
  },

  async markAllNotificationsRead(userId: string) {
    await db
      .update(userNotifications)
      .set({ isRead: true, readAt: new Date() })
      .where(and(eq(userNotifications.userId, userId), eq(userNotifications.isRead, false)));
  },
};
