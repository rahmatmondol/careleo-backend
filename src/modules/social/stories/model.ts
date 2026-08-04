import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import { stories } from '@/shared/db/schema';

export const StoriesModel = {
  async insert(values: { userId: string; petId?: string; imageUrl: string; caption?: string; expiresAt: Date }) {
    const [story] = await db.insert(stories).values(values).returning();
    return story;
  },
  /** Active (non-expired) stories, oldest first within each user. */
  async listActive() {
    return db.select().from(stories)
      .where(gt(stories.expiresAt, sql`now()`))
      .orderBy(asc(stories.createdAt));
  },
  async findById(storyId: string) {
    const [story] = await db.select().from(stories).where(eq(stories.id, storyId));
    return story ?? null;
  },
  async remove(storyId: string, userId: string) {
    await db.delete(stories).where(and(eq(stories.id, storyId), eq(stories.userId, userId)));
  },
};
