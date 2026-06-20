import { and, count, desc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { videoSessions } from '../../db/schema';

/** Pure DB access for video sessions. */
export const SessionsModel = {
  async listByUser(userId: string, opts: { status?: string }) {
    const conds: any[] = [eq(videoSessions.userId, userId)];
    if (opts.status) conds.push(eq(videoSessions.status, opts.status));
    return db.select().from(videoSessions)
      .where(and(...conds))
      .orderBy(desc(videoSessions.startedAt))
      .limit(100);
  },

  async findById(userId: string, id: string) {
    const [row] = await db.select().from(videoSessions)
      .where(and(eq(videoSessions.id, id), eq(videoSessions.userId, userId)))
      .limit(1);
    return row ?? null;
  },

  async update(id: string, data: Record<string, unknown>) {
    const [updated] = await db.update(videoSessions).set(data).where(eq(videoSessions.id, id)).returning();
    return updated;
  },

  // ─── Admin / moderation ────────────────────────────────
  /** All sessions regardless of owner, with optional status filter. */
  async listAllForAdmin(opts: { status?: string; limit: number; offset: number }) {
    const where = opts.status ? eq(videoSessions.status, opts.status) : undefined;
    return db.select().from(videoSessions)
      .where(where)
      .orderBy(desc(videoSessions.startedAt))
      .limit(opts.limit).offset(opts.offset);
  },

  async countAll() {
    const [row] = await db.select({ count: count() }).from(videoSessions);
    return row?.count ?? 0;
  },

  /** Count of currently-active (not ended) sessions. */
  async countActive() {
    const [row] = await db.select({ count: count() }).from(videoSessions).where(eq(videoSessions.status, 'ACTIVE'));
    return row?.count ?? 0;
  },
};
