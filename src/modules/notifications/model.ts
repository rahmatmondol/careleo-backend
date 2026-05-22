import { and, eq } from 'drizzle-orm';
import { db } from '@/shared/db';
import { deviceTokens } from '@/shared/db/schema';

export const NotificationsModel = {
  /**
   * Upsert an FCM token for a user.
   */
  async upsertDeviceToken(payload: {
    userId: string;
    fcmToken: string;
    platform: string;
    appVersion?: string;
  }) {
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

  /**
   * Deactivate a specific FCM token for a user.
   */
  async deactivateDeviceToken(userId: string, fcmToken: string) {
    await db
      .update(deviceTokens)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.fcmToken, fcmToken)));
  },
};
