// =====================================
// Comments Handlers — addComment, getComments, deleteComment
// =====================================

import { db } from '../db';
import { posts, comments, notifications } from '../db/schema';
import { eq, desc, sql } from 'drizzle-orm';

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
