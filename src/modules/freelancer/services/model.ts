import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import { freelancerServices, freelancerProfiles, freelancerAccounts } from '@/shared/db/schema';

export const ServicesModel = {
  async listByProfile(profileId: string) {
    return db.select().from(freelancerServices)
      .where(eq(freelancerServices.profileId, profileId))
      .orderBy(desc(freelancerServices.createdAt));
  },

  async findById(id: string) {
    const [s] = await db.select().from(freelancerServices).where(eq(freelancerServices.id, id));
    return s ?? null;
  },

  async insert(values: {
    profileId: string; serviceType: string; title: string; description?: string;
    price: string; billingPeriod?: string;
  }) {
    const [s] = await db.insert(freelancerServices).values(values).returning();
    return s;
  },

  async update(id: string, data: Record<string, unknown>) {
    const [updated] = await db.update(freelancerServices)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(freelancerServices.id, id)).returning();
    return updated;
  },

  async remove(id: string) {
    await db.delete(freelancerServices).where(eq(freelancerServices.id, id));
  },

  /**
   * Customer-facing search: only approved + active gigs from active,
   * non-suspended freelancers. Filter by serviceType / location / minRating.
   */
  async search(opts: {
    serviceType?: string; location?: string; minRating?: number; limit: number; offset: number;
  }) {
    const conds = [
      eq(freelancerServices.moderationStatus, 'approved'),
      eq(freelancerServices.isActive, true),
      eq(freelancerProfiles.isActive, true),
      eq(freelancerAccounts.status, 'active'),
    ];
    if (opts.serviceType) conds.push(eq(freelancerServices.serviceType, opts.serviceType));
    if (opts.location) conds.push(sql`${freelancerProfiles.location} ILIKE ${'%' + opts.location + '%'}`);
    if (opts.minRating !== undefined) conds.push(sql`${freelancerProfiles.rating} >= ${opts.minRating}`);

    return db.select({
      serviceId: freelancerServices.id,
      profileId: freelancerProfiles.id,
      displayName: freelancerAccounts.displayName,
      serviceType: freelancerServices.serviceType,
      title: freelancerServices.title,
      description: freelancerServices.description,
      price: freelancerServices.price,
      billingPeriod: freelancerServices.billingPeriod,
      location: freelancerProfiles.location,
      rating: freelancerProfiles.rating,
      ratingCount: freelancerProfiles.ratingCount,
      isVerified: freelancerProfiles.isVerified,
    })
      .from(freelancerServices)
      .innerJoin(freelancerProfiles, eq(freelancerServices.profileId, freelancerProfiles.id))
      .innerJoin(freelancerAccounts, eq(freelancerProfiles.accountId, freelancerAccounts.id))
      .where(and(...conds))
      .orderBy(desc(freelancerProfiles.rating))
      .limit(opts.limit).offset(opts.offset);
  },

  /** Approved active gigs for a single public profile. */
  async listPublicByProfile(profileId: string) {
    return db.select().from(freelancerServices)
      .where(and(
        eq(freelancerServices.profileId, profileId),
        eq(freelancerServices.moderationStatus, 'approved'),
        eq(freelancerServices.isActive, true),
      ))
      .orderBy(desc(freelancerServices.createdAt));
  },
};
