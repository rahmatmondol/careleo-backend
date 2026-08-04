import { eq } from 'drizzle-orm';
import { db } from '@/shared/db';
import { freelancerProfiles, freelancerAccounts } from '@/shared/db/schema';

export const ProfilesModel = {
  async getByAccount(accountId: string) {
    const [p] = await db.select().from(freelancerProfiles).where(eq(freelancerProfiles.accountId, accountId));
    return p ?? null;
  },

  async getById(profileId: string) {
    const [p] = await db.select().from(freelancerProfiles).where(eq(freelancerProfiles.id, profileId));
    return p ?? null;
  },

  /** Public profile joined with the account's display name + status. */
  async getPublic(profileId: string) {
    const [row] = await db.select({
      id: freelancerProfiles.id,
      displayName: freelancerAccounts.displayName,
      accountStatus: freelancerAccounts.status,
      bio: freelancerProfiles.bio,
      location: freelancerProfiles.location,
      serviceTypes: freelancerProfiles.serviceTypes,
      avatarUrl: freelancerProfiles.avatarUrl,
      rating: freelancerProfiles.rating,
      ratingCount: freelancerProfiles.ratingCount,
      isVerified: freelancerProfiles.isVerified,
      isActive: freelancerProfiles.isActive,
    })
      .from(freelancerProfiles)
      .innerJoin(freelancerAccounts, eq(freelancerProfiles.accountId, freelancerAccounts.id))
      .where(eq(freelancerProfiles.id, profileId));
    return row ?? null;
  },

  async update(accountId: string, data: Record<string, unknown>) {
    const [updated] = await db.update(freelancerProfiles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(freelancerProfiles.accountId, accountId)).returning();
    return updated;
  },
};
