import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { notifications } from '../../db/schema';

export const NotificationsModel = {
  /** Create a notification. No-op semantics are handled by callers (e.g. don't notify self). */
  async create(values: { userId: string; actorId?: string; type: string; message: string; postId?: string }) {
    await db.insert(notifications).values(values);
  },
  async listForUser(userId: string, limit = 50) {
    return db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt)).limit(limit);
  },
  async markRead(notifId: string, userId: string) {
    await db.update(notifications).set({ isRead: true })
      .where(and(eq(notifications.id, notifId), eq(notifications.userId, userId)));
  },
};
