// =====================================
// Likes Handlers — toggleLike, getLikes
// =====================================

import { db } from '../db';
import { posts, likes, notifications } from '../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

export async function toggleLike(postId: string, userId: string) {
  const existing = await db.select().from(likes)
    .where(and(eq(likes.postId, postId), eq(likes.userId, userId)));

  if (existing.length > 0) {
    await db.delete(likes).where(eq(likes.id, existing[0]!.id));
    await db.update(posts).set({ likeCount: sql`GREATEST(like_count - 1, 0)` }).where(eq(posts.id, postId));
    return { data: { liked: false, message: 'Unliked' } };
  }

  await db.insert(likes).values({ postId, userId });
  await db.update(posts).set({ likeCount: sql`like_count + 1` }).where(eq(posts.id, postId));

  // Notify
  const [post] = await db.select({ userId: posts.userId }).from(posts).where(eq(posts.id, postId));
  if (post && post.userId !== userId) {
    await db.insert(notifications).values({
      userId: post.userId, actorId: userId, type: 'like',
      message: 'Someone liked your post', postId,
    });
  }

  return { data: { liked: true, message: 'Liked' } };
}

export async function getLikes(postId: string) {
  const result = await db.select().from(likes)
    .where(eq(likes.postId, postId)).orderBy(desc(likes.createdAt));
  return { data: { likes: result, count: result.length } };
}
