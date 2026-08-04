import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import { freelancerProfiles, freelancerServices, freelancerAccounts } from '@/shared/db/schema';

export const InternalModel = {
  /**
   * Pick the best active, verified freelancer for a given service type —
   * highest rating, highest completed-job count (via rating_count).
   */
  async bestForServiceType(serviceType: string) {
    const [row] = await db.select({
      profileId: freelancerProfiles.id,
      accountId: freelancerProfiles.accountId,
      rating: freelancerProfiles.rating,
    })
      .from(freelancerServices)
      .innerJoin(freelancerProfiles, eq(freelancerServices.profileId, freelancerProfiles.id))
      .innerJoin(freelancerAccounts, eq(freelancerProfiles.accountId, freelancerAccounts.id))
      .where(and(
        eq(freelancerServices.serviceType, serviceType),
        eq(freelancerServices.moderationStatus, 'approved'),
        eq(freelancerServices.isActive, true),
        eq(freelancerProfiles.isActive, true),
        eq(freelancerProfiles.isVerified, true),
        eq(freelancerAccounts.status, 'active'),
      ))
      .orderBy(desc(freelancerProfiles.rating))
      .limit(1);
    return row ?? null;
  },

  async getServiceByProfile(profileId: string, serviceType: string) {
    const [s] = await db.select().from(freelancerServices)
      .where(and(
        eq(freelancerServices.profileId, profileId),
        eq(freelancerServices.serviceType, serviceType),
        eq(freelancerServices.moderationStatus, 'approved'),
        eq(freelancerServices.isActive, true),
      ))
      .limit(1);
    return s ?? null;
  },

  async getAccountById(accountId: string) {
    const [acc] = await db.select().from(freelancerAccounts)
      .where(eq(freelancerAccounts.id, accountId));
    return acc ?? null;
  },
};
