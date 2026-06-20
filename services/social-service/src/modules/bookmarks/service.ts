import { BookmarksModel } from './model';

export const BookmarksService = {
  /** Toggle a bookmark on a post. */
  async toggle(postId: string, userId: string) {
    const existing = await BookmarksModel.find(postId, userId);
    if (existing) {
      await BookmarksModel.remove(existing.id);
      return { data: { bookmarked: false, message: 'Removed from saved' } };
    }
    await BookmarksModel.add(postId, userId);
    return { data: { bookmarked: true, message: 'Saved' } };
  },

  async list(userId: string) {
    const rows = await BookmarksModel.listForUser(userId);
    return { data: { bookmarks: rows, count: rows.length } };
  },
};
