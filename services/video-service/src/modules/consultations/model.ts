import { and, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '../../db';
import { videoConsultations } from '../../db/schema';

/** Pure DB access for video consultations. */
export const ConsultationsModel = {
  async listByUser(userId: string, opts: { status?: string; vetId?: string }) {
    const conds: any[] = [eq(videoConsultations.userId, userId)];
    if (opts.status) conds.push(eq(videoConsultations.status, opts.status));
    if (opts.vetId) conds.push(eq(videoConsultations.vetId, opts.vetId));
    return db.select().from(videoConsultations)
      .where(and(...conds))
      .orderBy(desc(videoConsultations.scheduledAt))
      .limit(100);
  },

  async findById(userId: string, id: string) {
    const [row] = await db.select().from(videoConsultations)
      .where(and(eq(videoConsultations.id, id), eq(videoConsultations.userId, userId)))
      .limit(1);
    return row ?? null;
  },

  async insert(values: { userId: string; vetId: string; petId?: string | null; scheduledAt: Date; notes?: string | null }) {
    const [row] = await db.insert(videoConsultations).values({
      userId: values.userId,
      vetId: values.vetId,
      petId: values.petId ?? null,
      scheduledAt: values.scheduledAt,
      notes: values.notes ?? null,
      status: 'SCHEDULED',
    }).returning();
    return row;
  },

  async update(id: string, data: Record<string, unknown>) {
    const [updated] = await db.update(videoConsultations).set(data).where(eq(videoConsultations.id, id)).returning();
    return updated;
  },

  /** Scheduled consultations for a vet within a day window — used for slot availability. */
  async bookedSlots(vetId: string, startOfDay: Date, endOfDay: Date) {
    return db.select({ scheduledAt: videoConsultations.scheduledAt })
      .from(videoConsultations)
      .where(and(
        eq(videoConsultations.vetId, vetId),
        gte(videoConsultations.scheduledAt, startOfDay),
        lte(videoConsultations.scheduledAt, endOfDay),
        eq(videoConsultations.status, 'SCHEDULED'),
      ));
  },

  // ─── Admin / moderation ────────────────────────────────
  /** All consultations regardless of owner, with optional status/vetId/userId filters. */
  async listAllForAdmin(opts: { status?: string; vetId?: string; userId?: string; limit: number; offset: number }) {
    const conds = [];
    if (opts.status) conds.push(eq(videoConsultations.status, opts.status));
    if (opts.vetId) conds.push(eq(videoConsultations.vetId, opts.vetId));
    if (opts.userId) conds.push(eq(videoConsultations.userId, opts.userId));
    const where = conds.length ? and(...conds) : undefined;
    return db.select().from(videoConsultations)
      .where(where)
      .orderBy(desc(videoConsultations.scheduledAt))
      .limit(opts.limit).offset(opts.offset);
  },

  async findByIdAdmin(id: string) {
    const [row] = await db.select().from(videoConsultations).where(eq(videoConsultations.id, id));
    return row ?? null;
  },

  async countAll() {
    const [row] = await db.select({ count: count() }).from(videoConsultations);
    return row?.count ?? 0;
  },

  /** Consultation counts grouped by status, for the admin dashboard. */
  async countsByStatus() {
    const rows = await db.select({ status: videoConsultations.status, c: count() })
      .from(videoConsultations)
      .groupBy(videoConsultations.status);
    return rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = Number(r.c);
      return acc;
    }, {});
  },

  /** Consultation counts per day for the last `days` days (oldest → newest), for the trend chart. */
  async dailyCounts(days = 7) {
    const rows = await db.execute(sql`
      SELECT to_char(d.day, 'YYYY-MM-DD') AS day, count(c.id)::int AS c
      FROM generate_series(
        (now()::date - ${sql.raw(String(days - 1))} * interval '1 day'),
        now()::date,
        interval '1 day'
      ) AS d(day)
      LEFT JOIN video_consultations c ON c.scheduled_at::date = d.day
      GROUP BY d.day
      ORDER BY d.day ASC
    `);
    return (rows as unknown as Array<{ day: string; c: number }>).map((r) => Number(r.c));
  },
};
