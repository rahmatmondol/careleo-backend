import { desc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { earnings } from '../../db/schema';

export const EarningsModel = {
  async insert(values: {
    profileId: string; jobId: string; amount: string;
    platformFeePct: string; platformFee: string; netAmount: string;
  }) {
    const [e] = await db.insert(earnings).values(values).returning();
    return e;
  },

  async listByProfile(profileId: string) {
    return db.select().from(earnings).where(eq(earnings.profileId, profileId)).orderBy(desc(earnings.createdAt));
  },

  async findByJob(jobId: string) {
    const [e] = await db.select().from(earnings).where(eq(earnings.jobId, jobId));
    return e ?? null;
  },

  async setPayoutStatus(id: string, payoutStatus: string, extra: Record<string, unknown> = {}) {
    const [updated] = await db.update(earnings)
      .set({ payoutStatus, ...extra }).where(eq(earnings.id, id)).returning();
    return updated;
  },
};
