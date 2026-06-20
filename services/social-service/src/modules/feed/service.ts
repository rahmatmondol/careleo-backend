import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db';
import { posts } from '../../db/schema';
import { PostsModel } from '../posts/model';
import { FollowsModel } from '../follows/model';

export const FeedService = {
  /** Global feed of active posts, newest first. */
  async forYou(page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const [items, total] = await Promise.all([PostsModel.listActive(limit, offset), PostsModel.countActive()]);
    return { data: { posts: items, total, page, limit } };
  },

  /** Trending: ranked by engagement then recency. */
  async trending(page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const items = await db.select().from(posts)
      .where(eq(posts.status, 'active'))
      .orderBy(desc(posts.likeCount), desc(posts.commentCount), desc(posts.createdAt))
      .limit(limit).offset(offset);
    return { data: { posts: items } };
  },

  /** Posts from people the user follows. */
  async following(userId: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const followingIds = (await FollowsModel.following(userId)).map((f) => f.followingId);
    if (!followingIds.length) return { data: { posts: [], total: 0 } };

    const items = await db.select().from(posts)
      .where(and(inArray(posts.userId, followingIds), eq(posts.status, 'active')))
      .orderBy(desc(posts.createdAt))
      .limit(limit).offset(offset);
    return { data: { posts: items } };
  },
};
