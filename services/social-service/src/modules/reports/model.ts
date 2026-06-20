import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import { reports, posts } from '../../db/schema';

export const ReportsModel = {
  /** Has this user already filed a still-open report against this post? */
  async findPending(postId: string, reporterId: string) {
    const rows = await db.select().from(reports)
      .where(and(eq(reports.postId, postId), eq(reports.reporterId, reporterId), eq(reports.status, 'pending')));
    return rows[0] ?? null;
  },

  /** Create a report and flag the post as reported, atomically. */
  async create(values: { postId: string; reporterId: string; reason: string }) {
    return db.transaction(async (tx) => {
      const [report] = await tx.insert(reports).values(values).returning();
      await tx.update(posts).set({ isReported: true }).where(eq(posts.id, values.postId));
      return report;
    });
  },

  async findById(reportId: string) {
    const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
    return report ?? null;
  },

  /** Report queue, optionally filtered by status, newest first, joined with the post for a content snapshot. */
  async listAll(status: string | undefined, limit: number, offset: number) {
    const where = status ? eq(reports.status, status) : undefined;
    return db.select({
      id: reports.id,
      postId: reports.postId,
      reporterId: reports.reporterId,
      reason: reports.reason,
      status: reports.status,
      createdAt: reports.createdAt,
      reviewedAt: reports.reviewedAt,
      reviewedBy: reports.reviewedBy,
      postContent: posts.content,
      postAuthorId: posts.userId,
    })
      .from(reports)
      .leftJoin(posts, eq(reports.postId, posts.id))
      .where(where)
      .orderBy(desc(reports.createdAt))
      .limit(limit).offset(offset);
  },

  async updateStatus(reportId: string, status: string, reviewerId: string) {
    const [updated] = await db.update(reports)
      .set({ status, reviewedBy: reviewerId, reviewedAt: new Date() })
      .where(eq(reports.id, reportId)).returning();
    return updated;
  },

  async countPending() {
    const [row] = await db.select({ c: sql<number>`count(*)` }).from(reports).where(eq(reports.status, 'pending'));
    return Number(row?.c ?? 0);
  },
};
