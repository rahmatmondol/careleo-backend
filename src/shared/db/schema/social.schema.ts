import {
  index,
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  text,
  boolean,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { pets } from './pets.schema';

/**
 * Social domain — ported from the standalone social-service.
 *
 * Every `user_id` / `actor_id` / `follower_id` style column was a bare uuid
 * while this lived in `careleo_social`; now that the tables share a database
 * with `users` they are real foreign keys.
 *
 * Note: `notifications` here is the social activity feed (like/comment/follow).
 * It is distinct from `user_notifications` (push/in-app delivery) and
 * `notification_logs` (delivery audit) in the core schema.
 */

export const posts = pgTable(
  'posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    petId: uuid('pet_id').references(() => pets.id, { onDelete: 'set null' }),
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
  },
  (t) => [
    index('idx_posts_user_id').on(t.userId),
    index('idx_posts_status_created').on(t.status, t.createdAt),
  ],
);

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .references(() => posts.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Null = top-level comment; set = reply to another comment (one level of threading).
    parentId: uuid('parent_id').references((): AnyPgColumn => comments.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    likeCount: integer('like_count').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('idx_comments_post_id').on(t.postId)],
);

export const commentLikes = pgTable(
  'comment_likes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    commentId: uuid('comment_id')
      .references(() => comments.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('comment_likes_comment_user_uniq').on(t.commentId, t.userId)],
);

export const likes = pgTable(
  'likes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .references(() => posts.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('likes_post_user_uniq').on(t.postId, t.userId)],
);

export const follows = pgTable(
  'follows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    followerId: uuid('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followingId: uuid('following_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('follows_follower_following_uniq').on(t.followerId, t.followingId),
    index('idx_follows_following_id').on(t.followingId),
  ],
);

export const shares = pgTable('shares', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id')
    .references(() => posts.id, { onDelete: 'cascade' })
    .notNull(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  platform: varchar('platform', { length: 20 }), // in_app, whatsapp, etc
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // who caused the notification
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    type: varchar('type', { length: 50 }).notNull(), // like, comment, follow, share
    message: varchar('message', { length: 500 }).notNull(),
    postId: uuid('post_id').references(() => posts.id, { onDelete: 'cascade' }),
    isRead: boolean('is_read').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('idx_social_notifications_user_read').on(t.userId, t.isRead)],
);

export const bookmarks = pgTable(
  'bookmarks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .references(() => posts.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('bookmarks_post_user_uniq').on(t.postId, t.userId)],
);

export const stories = pgTable(
  'stories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    petId: uuid('pet_id').references(() => pets.id, { onDelete: 'set null' }),
    imageUrl: varchar('image_url', { length: 500 }).notNull(),
    caption: varchar('caption', { length: 500 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    // Stories disappear after 24h; the feed filters on expiresAt > now().
    expiresAt: timestamp('expires_at').notNull(),
  },
  (t) => [index('idx_stories_expires_at').on(t.expiresAt)],
);

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .references(() => posts.id, { onDelete: 'cascade' })
      .notNull(),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    // pending (new) -> resolved (action taken) | dismissed (no action). reviewed is reserved.
    status: varchar('status', { length: 20 }).default('pending').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    reviewedAt: timestamp('reviewed_at'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [index('idx_reports_status').on(t.status)],
);
