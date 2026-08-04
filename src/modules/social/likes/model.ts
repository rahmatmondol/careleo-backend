import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import { likes, posts } from '@/shared/db/schema';

export const LikesModel = {
  async find(postId: string, userId: string) {
    const rows = await db.select().from(likes).where(and(eq(likes.postId, postId), eq(likes.userId, userId)));
    return rows[0] ?? null;
  },
  async listByPost(postId: string) {
    return db.select().from(likes).where(eq(likes.postId, postId)).orderBy(desc(likes.createdAt));
  },
  /** Insert a like and bump the post counter atomically. */
  async add(postId: string, userId: string) {
    await db.transaction(async (tx) => {
      await tx.insert(likes).values({ postId, userId });
      await tx.update(posts).set({ likeCount: sql`like_count + 1` }).where(eq(posts.id, postId));
    });
  },
  /** Remove a like and decrement the post counter atomically. */
  async remove(likeId: string, postId: string) {
    await db.transaction(async (tx) => {
      await tx.delete(likes).where(eq(likes.id, likeId));
      await tx.update(posts).set({ likeCount: sql`GREATEST(like_count - 1, 0)` }).where(eq(posts.id, postId));
    });
  },
  async postOwner(postId: string) {
    const [post] = await db.select({ userId: posts.userId }).from(posts).where(eq(posts.id, postId));
    return post?.userId ?? null;
  },
};
