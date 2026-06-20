import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import { shares, posts } from '../../db/schema';

export const SharesModel = {
  async add(postId: string, userId: string, platform?: string) {
    return db.transaction(async (tx) => {
      const [share] = await tx.insert(shares).values({ postId, userId, platform }).returning();
      await tx.update(posts).set({ shareCount: sql`share_count + 1` }).where(eq(posts.id, postId));
      return share;
    });
  },
  async listByPost(postId: string) {
    return db.select().from(shares).where(eq(shares.postId, postId)).orderBy(desc(shares.createdAt));
  },
};
