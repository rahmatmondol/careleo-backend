import { and, count, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import { posts } from '@/shared/db/schema';

/** Pure DB access for posts. */
export const PostsModel = {
  async listActive(limit: number, offset: number) {
    return db.select().from(posts)
      .where(eq(posts.status, 'active'))
      .orderBy(desc(posts.createdAt))
      .limit(limit).offset(offset);
  },

  async countActive() {
    const [row] = await db.select({ count: count() }).from(posts).where(eq(posts.status, 'active'));
    return row?.count ?? 0;
  },

  async insert(values: { userId: string; content?: string; imageUrl?: string; videoUrl?: string; petId?: string }) {
    const [post] = await db.insert(posts).values(values).returning();
    return post;
  },

  async findById(postId: string) {
    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    return post ?? null;
  },

  async update(postId: string, data: Record<string, unknown>) {
    const [updated] = await db.update(posts).set(data).where(eq(posts.id, postId)).returning();
    return updated;
  },

  async remove(postId: string) {
    await db.delete(posts).where(eq(posts.id, postId));
  },

  async listByUser(userId: string) {
    return db.select().from(posts)
      .where(and(eq(posts.userId, userId), eq(posts.status, 'active')))
      .orderBy(desc(posts.createdAt));
  },

  // ─── Admin / moderation ────────────────────────────────
  /** All posts regardless of status, with optional status/reported filters. */
  async listAllForAdmin(opts: { status?: string; reported?: boolean; limit: number; offset: number }) {
    const conds = [];
    if (opts.status) conds.push(eq(posts.status, opts.status));
    if (opts.reported !== undefined) conds.push(eq(posts.isReported, opts.reported));
    const where = conds.length ? and(...conds) : undefined;
    return db.select().from(posts)
      .where(where)
      .orderBy(desc(posts.createdAt))
      .limit(opts.limit).offset(opts.offset);
  },

  async countAll() {
    const [row] = await db.select({ count: count() }).from(posts);
    return row?.count ?? 0;
  },

  /** Set moderation status (active|hidden). */
  async setStatus(postId: string, status: string) {
    const [updated] = await db.update(posts)
      .set({ status, updatedAt: new Date() })
      .where(eq(posts.id, postId)).returning();
    return updated;
  },

  /** Aggregate engagement + distinct-author counts for the admin dashboard. */
  async stats() {
    const [row] = await db.select({
      totalPosts: count(),
      activeUsers: sql<number>`count(distinct ${posts.userId})`,
      totalEngagement: sql<number>`coalesce(sum(${posts.likeCount} + ${posts.commentCount} + ${posts.shareCount}), 0)`,
    }).from(posts);
    return {
      totalPosts: Number(row?.totalPosts ?? 0),
      activeUsers: Number(row?.activeUsers ?? 0),
      totalEngagement: Number(row?.totalEngagement ?? 0),
    };
  },

  /** Post counts per day for the last `days` days (oldest → newest), for the engagement trend. */
  async dailyCounts(days = 7) {
    const rows = await db.execute(sql`
      SELECT to_char(d.day, 'YYYY-MM-DD') AS day, count(p.id)::int AS c
      FROM generate_series(
        (now()::date - ${sql.raw(String(days - 1))} * interval '1 day'),
        now()::date,
        interval '1 day'
      ) AS d(day)
      LEFT JOIN posts p ON p.created_at::date = d.day
      GROUP BY d.day
      ORDER BY d.day ASC
    `);
    return (rows as unknown as Array<{ day: string; c: number }>).map((r) => Number(r.c));
  },
};
