// =====================================
// Posts Handlers — createPost, getPost, updatePost, deletePost, getUserPosts, listPosts
// =====================================

import { db } from '../db';
import { posts } from '../db/schema';
import { eq, desc, count } from 'drizzle-orm';

export async function listPosts(page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const result = await db.select().from(posts)
    .where(eq(posts.isReported, false))
    .orderBy(desc(posts.createdAt))
    .limit(limit).offset(offset);

  const [totalRow] = await db.select({ count: count() }).from(posts).where(eq(posts.isReported, false));
  return { data: { posts: result, total: totalRow?.count ?? 0, page, limit } };
}

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

export async function updatePost(postId: string, userId: string, body: any) {
  const [post] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!post) return { status: 404, error: 'Post not found' };
  if (post.userId !== userId) return { status: 403, error: 'Not authorized' };

  const updateData: any = { updatedAt: new Date() };
  if (body.content !== undefined) updateData.content = body.content;
  if (body.imageUrl !== undefined) updateData.imageUrl = body.imageUrl;
  if (body.videoUrl !== undefined) updateData.videoUrl = body.videoUrl;
  if (body.petId !== undefined) updateData.petId = body.petId;

  const [updated] = await db.update(posts).set(updateData).where(eq(posts.id, postId)).returning();
  return { data: { post: updated } };
}

export async function deletePost(postId: string, userId: string) {
  const [post] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!post) return { status: 404, error: 'Post not found' };
  if (post.userId !== userId) return { status: 403, error: 'Not authorized' };
  await db.delete(posts).where(eq(posts.id, postId));
  return { data: { message: 'Post deleted' } };
}

export async function getUserPosts(userId: string) {
  const result = await db.select().from(posts)
    .where(eq(posts.userId, userId)).orderBy(desc(posts.createdAt));
  return { data: { posts: result } };
}
