import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { bookmarks, posts } from '../../db/schema';

export const BookmarksModel = {
  async find(postId: string, userId: string) {
    const rows = await db.select().from(bookmarks).where(and(eq(bookmarks.postId, postId), eq(bookmarks.userId, userId)));
    return rows[0] ?? null;
  },
  async add(postId: string, userId: string) {
    await db.insert(bookmarks).values({ postId, userId });
  },
  async remove(bookmarkId: string) {
    await db.delete(bookmarks).where(eq(bookmarks.id, bookmarkId));
  },
  /** The user's saved posts, joined with the post itself, newest-saved first. */
  async listForUser(userId: string) {
    return db.select({
      bookmarkId: bookmarks.id,
      savedAt: bookmarks.createdAt,
      post: posts,
    })
      .from(bookmarks)
      .innerJoin(posts, eq(bookmarks.postId, posts.id))
      .where(eq(bookmarks.userId, userId))
      .orderBy(desc(bookmarks.createdAt));
  },
};
