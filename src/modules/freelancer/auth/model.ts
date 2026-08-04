import { eq } from 'drizzle-orm';
import { db } from '@/shared/db';
import { freelancerAccounts, freelancerProfiles } from '@/shared/db/schema';

export const AuthModel = {
  async findByEmail(email: string) {
    const [acc] = await db.select().from(freelancerAccounts).where(eq(freelancerAccounts.email, email));
    return acc ?? null;
  },

  async findById(id: string) {
    const [acc] = await db.select().from(freelancerAccounts).where(eq(freelancerAccounts.id, id));
    return acc ?? null;
  },

  async createAccount(values: { email: string; passwordHash: string; displayName: string; phone?: string }) {
    const [acc] = await db.insert(freelancerAccounts).values(values).returning();
    return acc;
  },

  /** Every account gets a profile row on signup so gigs/jobs can attach. */
  async createProfile(accountId: string) {
    const [profile] = await db.insert(freelancerProfiles).values({ accountId }).returning();
    return profile;
  },

  async getProfileByAccount(accountId: string) {
    const [profile] = await db.select().from(freelancerProfiles).where(eq(freelancerProfiles.accountId, accountId));
    return profile ?? null;
  },
};
