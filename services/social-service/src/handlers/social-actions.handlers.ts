// =====================================
// Social Actions Handlers — sharePost, getShares, followUser, unfollowUser, getFollowers, getFollowing + notifications
// =====================================

import { db } from '../db';
import { posts, follows, shares, notifications } from '../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

// ─── Shares ────────────────────────────────────────────

export async function sharePost(postId: string, userId: string, platform?: string) {
  const [share] = await db.insert(shares).values({ postId, userId, platform }).returning();
  await db.update(posts).set({ shareCount: sql`share_count + 1` }).where(eq(posts.id, postId));
  return { data: { share } };
}

export async function getShares(postId: string) {
  const result = await db.select().from(shares).where(eq(shares.postId, postId)).orderBy(desc(shares.createdAt));
  return { data: { shares: result } };
}

// ─── Follows ───────────────────────────────────────────

export async function followUser(followerId: string, followingId: string) {
  if (followerId === followingId) return { status: 400, error: 'Cannot follow yourself' };

  const existing = await db.select().from(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)));

  if (existing.length > 0) return { status: 409, error: 'Already following' };

  await db.insert(follows).values({ followerId, followingId });

  await db.insert(notifications).values({
    userId: followingId, actorId: followerId, type: 'follow',
    message: 'Someone started following you',
  });

  return { data: { following: true, message: 'Followed' } };
}

export async function unfollowUser(followerId: string, followingId: string) {
  const existing = await db.select().from(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)));

  if (existing.length === 0) return { status: 404, error: 'Not following' };

  await db.delete(follows).where(eq(follows.id, existing[0]!.id));
  return { data: { following: false, message: 'Unfollowed' } };
}

export async function getFollowers(userId: string) {
  const result = await db.select({ followerId: follows.followerId, createdAt: follows.createdAt })
    .from(follows).where(eq(follows.followingId, userId));
  return { data: { followers: result, count: result.length } };
}

export async function getFollowing(userId: string) {
  const result = await db.select({ followingId: follows.followingId, createdAt: follows.createdAt })
    .from(follows).where(eq(follows.followerId, userId));
  return { data: { following: result, count: result.length } };
}

// ─── Notifications ─────────────────────────────────────

export async function getNotifications(userId: string) {
  const result = await db.select().from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt)).limit(50);
  return { data: { notifications: result } };
}

export async function markNotificationRead(notifId: string, userId: string) {
  await db.update(notifications).set({ isRead: true })
    .where(and(eq(notifications.id, notifId), eq(notifications.userId, userId)));
  return { data: { message: 'Marked read' } };
}
