// =====================================
// Social Handlers — Posts, Feed, Comments, Likes, Shares, Follows
// =====================================

import { db } from '../db';
import { posts, comments, likes, follows, shares, notifications } from '../db/schema';
import { eq, and, or, desc, sql, inArray, count } from 'drizzle-orm';

// ─── Feed ─────────────────────────────────────────────

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
  // Get users this user follows
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

// ─── Posts CRUD ────────────────────────────────────────

export async function createPost(userId: string, body: any) {
  const [post] = await db.insert(posts).values({
    userId, content: body.content, imageUrl: body.imageUrl,
    videoUrl: body.videoUrl, petId: body.petId,
  }).returning();
  if (!post) throw new Error('Failed to create post');
  return { data: { post } };
}

export async function getPost(postId: string) {
  const [post] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!post) return { status: 404, error: 'Post not found' };
  return { data: { post } };
}

export async function deletePost(postId: string, userId: string) {
  const [post] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!post) return { status: 404, error: 'Post not found' };
  if (post.userId !== userId) return { status: 403, error: 'Not authorized' };
  await db.delete(posts).where(eq(posts.id, postId));
  return { data: { message: 'Post deleted' } };
}

// ─── Comments ──────────────────────────────────────────

export async function addComment(postId: string, userId: string, content: string) {
  const [comment] = await db.insert(comments).values({ postId, userId, content }).returning();
  await db.update(posts).set({ commentCount: sql`comment_count + 1` }).where(eq(posts.id, postId));

  // Notify post owner
  const [post] = await db.select({ userId: posts.userId }).from(posts).where(eq(posts.id, postId));
  if (post && post.userId !== userId) {
    await db.insert(notifications).values({
      userId: post.userId, actorId: userId, type: 'comment',
      message: 'Someone commented on your post', postId,
    });
  }

  return { data: { comment } };
}

export async function getComments(postId: string) {
  const result = await db.select().from(comments)
    .where(eq(comments.postId, postId)).orderBy(desc(comments.createdAt));
  return { data: { comments: result } };
}

export async function deleteComment(commentId: string, userId: string) {
  const [comment] = await db.select().from(comments).where(eq(comments.id, commentId));
  if (!comment) return { status: 404, error: 'Comment not found' };
  if (comment.userId !== userId) return { status: 403, error: 'Not authorized' };

  await db.delete(comments).where(eq(comments.id, commentId));
  await db.update(posts).set({ commentCount: sql`GREATEST(comment_count - 1, 0)` }).where(eq(posts.id, comment.postId));

  return { data: { message: 'Comment deleted' } };
}

// ─── Likes (toggle) ────────────────────────────────────

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

export async function toggleFollow(followerId: string, followingId: string) {
  if (followerId === followingId) return { status: 400, error: 'Cannot follow yourself' };

  const existing = await db.select().from(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)));

  if (existing.length > 0) {
    await db.delete(follows).where(eq(follows.id, existing[0]!.id));
    return { data: { following: false, message: 'Unfollowed' } };
  }

  await db.insert(follows).values({ followerId, followingId });

  await db.insert(notifications).values({
    userId: followingId, actorId: followerId, type: 'follow',
    message: 'Someone started following you',
  });

  return { data: { following: true, message: 'Followed' } };
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

export async function getUserPosts(userId: string) {
  const result = await db.select().from(posts)
    .where(eq(posts.userId, userId)).orderBy(desc(posts.createdAt));
  return { data: { posts: result } };
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
