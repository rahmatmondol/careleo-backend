// =====================================
// Feed Handlers — getFeed, getTrendingFeed, getFollowingFeed
// =====================================

import { db } from '../db';
import { posts, follows } from '../db/schema';
import { eq, and, desc, sql, inArray, count } from 'drizzle-orm';

export async function getFeed(page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const result = await db.select().from(posts)
    .where(eq(posts.isReported, false))
    .orderBy(desc(posts.createdAt))
    .limit(limit).offset(offset);

  const [totalRow] = await db.select({ count: count() }).from(posts);
  return { data: { posts: result, total: totalRow?.count ?? 0, page, limit } };
}

export async function getTrendingFeed(page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const result = await db.select().from(posts)
    .where(eq(posts.isReported, false))
    .orderBy(desc(posts.likeCount), desc(posts.commentCount), desc(posts.createdAt))
    .limit(limit).offset(offset);
  return { data: { posts: result } };
}

export async function getFollowingFeed(userId: string, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const following = await db.select({ followingId: follows.followingId })
    .from(follows).where(eq(follows.followerId, userId));
  const followingIds = following.map(f => f.followingId);

  if (!followingIds.length) return { data: { posts: [], total: 0 } };

  const result = await db.select().from(posts)
    .where(and(inArray(posts.userId, followingIds), eq(posts.isReported, false)))
    .orderBy(desc(posts.createdAt))
    .limit(limit).offset(offset);

  return { data: { posts: result } };
}
