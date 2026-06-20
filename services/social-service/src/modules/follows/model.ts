import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { follows } from '../../db/schema';

export const FollowsModel = {
  async find(followerId: string, followingId: string) {
    const rows = await db.select().from(follows).where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)));
    return rows[0] ?? null;
  },
  async add(followerId: string, followingId: string) {
    await db.insert(follows).values({ followerId, followingId });
  },
  async remove(followId: string) {
    await db.delete(follows).where(eq(follows.id, followId));
  },
  async followers(userId: string) {
    return db.select({ followerId: follows.followerId, createdAt: follows.createdAt })
      .from(follows).where(eq(follows.followingId, userId)).orderBy(desc(follows.createdAt));
  },
  async following(userId: string) {
    return db.select({ followingId: follows.followingId, createdAt: follows.createdAt })
      .from(follows).where(eq(follows.followerId, userId)).orderBy(desc(follows.createdAt));
  },
};
