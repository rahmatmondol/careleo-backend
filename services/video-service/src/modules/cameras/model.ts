import { and, count, desc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { petCameras } from '../../db/schema';

/** Pure DB access for pet cameras. */
export const CamerasModel = {
  async listByUser(userId: string) {
    return db.select().from(petCameras)
      .where(eq(petCameras.userId, userId))
      .orderBy(desc(petCameras.createdAt))
      .limit(100);
  },

  async findById(userId: string, id: string) {
    const [row] = await db.select().from(petCameras)
      .where(and(eq(petCameras.id, id), eq(petCameras.userId, userId)))
      .limit(1);
    return row ?? null;
  },

  async insert(values: { userId: string; petId?: string | null; name: string; streamUrl?: string | null }) {
    const [row] = await db.insert(petCameras).values({
      userId: values.userId,
      petId: values.petId ?? null,
      name: values.name,
      streamUrl: values.streamUrl ?? null,
      status: 'OFFLINE',
    }).returning();
    return row;
  },

  async update(id: string, data: Record<string, unknown>) {
    const [updated] = await db.update(petCameras).set(data).where(eq(petCameras.id, id)).returning();
    return updated;
  },

  async remove(id: string) {
    await db.delete(petCameras).where(eq(petCameras.id, id));
  },

  // ─── Admin / moderation ────────────────────────────────
  /** All cameras regardless of owner, with optional status filter. */
  async listAllForAdmin(opts: { status?: string; limit: number; offset: number }) {
    const where = opts.status ? eq(petCameras.status, opts.status) : undefined;
    return db.select().from(petCameras)
      .where(where)
      .orderBy(desc(petCameras.createdAt))
      .limit(opts.limit).offset(opts.offset);
  },

  async countAll() {
    const [row] = await db.select({ count: count() }).from(petCameras);
    return row?.count ?? 0;
  },

  async countsByStatus() {
    const rows = await db.select({ status: petCameras.status, c: count() })
      .from(petCameras)
      .groupBy(petCameras.status);
    return rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status ?? 'UNKNOWN'] = Number(r.c);
      return acc;
    }, {});
  },
};
