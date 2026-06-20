import { pgTable, uuid, varchar, timestamp, integer, text, boolean, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core';

export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  petId: uuid('pet_id'),
  content: text('content'),
  imageUrl: varchar('image_url', { length: 500 }),
  videoUrl: varchar('video_url', { length: 500 }),
  likeCount: integer('like_count').default(0).notNull(),
  commentCount: integer('comment_count').default(0).notNull(),
  shareCount: integer('share_count').default(0).notNull(),
  isReported: boolean('is_reported').default(false).notNull(),
  // Moderation state: 'active' (visible in feeds) | 'hidden' (taken down by an admin).
  status: varchar('status', { length: 20 }).default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const comments = pgTable('comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id').references(() => posts.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').notNull(),
  // Null = top-level comment; set = reply to another comment (one level of threading).
  parentId: uuid('parent_id').references((): AnyPgColumn => comments.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  likeCount: integer('like_count').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const commentLikes = pgTable('comment_likes', {
  id: uuid('id').primaryKey().defaultRandom(),
  commentId: uuid('comment_id').references(() => comments.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  uniqUserComment: uniqueIndex('comment_likes_comment_user_uniq').on(t.commentId, t.userId),
}));

export const likes = pgTable('likes', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id').references(() => posts.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  uniqUserPost: uniqueIndex('likes_post_user_uniq').on(t.postId, t.userId),
}));

export const follows = pgTable('follows', {
  id: uuid('id').primaryKey().defaultRandom(),
  followerId: uuid('follower_id').notNull(),
  followingId: uuid('following_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  uniqFollow: uniqueIndex('follows_follower_following_uniq').on(t.followerId, t.followingId),
}));

export const shares = pgTable('shares', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id').references(() => posts.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').notNull(),
  platform: varchar('platform', { length: 20 }), // in_app, whatsapp, etc
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  actorId: uuid('actor_id'), // who caused the notification
  type: varchar('type', { length: 50 }).notNull(), // like, comment, follow, share
  message: varchar('message', { length: 500 }).notNull(),
  postId: uuid('post_id'),
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const bookmarks = pgTable('bookmarks', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id').references(() => posts.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  uniqUserPost: uniqueIndex('bookmarks_post_user_uniq').on(t.postId, t.userId),
}));

export const stories = pgTable('stories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  petId: uuid('pet_id'),
  imageUrl: varchar('image_url', { length: 500 }).notNull(),
  caption: varchar('caption', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Stories disappear after 24h; the feed filters on expiresAt > now().
  expiresAt: timestamp('expires_at').notNull(),
});

export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id').references(() => posts.id, { onDelete: 'cascade' }).notNull(),
  reporterId: uuid('reporter_id').notNull(),
  reason: text('reason').notNull(),
  // pending (new) -> resolved (action taken) | dismissed (no action). reviewed is reserved.
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  reviewedAt: timestamp('reviewed_at'),
  reviewedBy: uuid('reviewed_by'),
});
