import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import { comments, commentLikes, posts } from '@/shared/db/schema';

export const CommentsModel = {
  /** Insert a comment (or reply when parentId set) and bump the post's comment counter. */
  async add(values: { postId: string; userId: string; content: string; parentId?: string }) {
    return db.transaction(async (tx) => {
      const [comment] = await tx.insert(comments).values(values).returning();
      await tx.update(posts).set({ commentCount: sql`comment_count + 1` }).where(eq(posts.id, values.postId));
      return comment;
    });
  },

  async findById(commentId: string) {
    const [comment] = await db.select().from(comments).where(eq(comments.id, commentId));
    return comment ?? null;
  },

  /** Top-level comments for a post (parentId IS NULL), newest first. */
  async listTopLevel(postId: string) {
    return db.select().from(comments)
      .where(and(eq(comments.postId, postId), isNull(comments.parentId)))
      .orderBy(desc(comments.createdAt));
  },

  /** All replies for a post, oldest first (so threads read top-to-bottom). */
  async listReplies(postId: string) {
    return db.select().from(comments)
      .where(and(eq(comments.postId, postId), sql`${comments.parentId} IS NOT NULL`))
      .orderBy(asc(comments.createdAt));
  },

  async remove(commentId: string, postId: string) {
    await db.transaction(async (tx) => {
      // Replies cascade via FK; count only the top-level/the comment itself reliably,
      // so recompute from the actual row count to avoid drift on threaded deletes.
      await tx.delete(comments).where(eq(comments.id, commentId));
      const [row] = await tx.select({ c: sql<number>`count(*)` }).from(comments).where(eq(comments.postId, postId));
      await tx.update(posts).set({ commentCount: Number(row?.c ?? 0) }).where(eq(posts.id, postId));
    });
  },

  async postOwner(postId: string) {
    const [post] = await db.select({ userId: posts.userId }).from(posts).where(eq(posts.id, postId));
    return post?.userId ?? null;
  },

  // ─── Comment likes ─────────────────────────────────────
  async findLike(commentId: string, userId: string) {
    const rows = await db.select().from(commentLikes).where(and(eq(commentLikes.commentId, commentId), eq(commentLikes.userId, userId)));
    return rows[0] ?? null;
  },
  async addLike(commentId: string, userId: string) {
    await db.transaction(async (tx) => {
      await tx.insert(commentLikes).values({ commentId, userId });
      await tx.update(comments).set({ likeCount: sql`like_count + 1` }).where(eq(comments.id, commentId));
    });
  },
  async removeLike(likeId: string, commentId: string) {
    await db.transaction(async (tx) => {
      await tx.delete(commentLikes).where(eq(commentLikes.id, likeId));
      await tx.update(comments).set({ likeCount: sql`GREATEST(like_count - 1, 0)` }).where(eq(comments.id, commentId));
    });
  },
};
