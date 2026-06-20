import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  freelancerAccounts, freelancerProfiles, freelancerServices,
  jobs, earnings, bookingReviews, supportTickets, supportMessages,
} from '../../db/schema';

export const AdminModel = {
  // ─── Freelancers ────────────────────────────────────────
  async listFreelancers(opts: { page: number; limit: number }) {
    return db.select({
      accountId: freelancerAccounts.id,
      email: freelancerAccounts.email,
      displayName: freelancerAccounts.displayName,
      status: freelancerAccounts.status,
      profileId: freelancerProfiles.id,
      isVerified: freelancerProfiles.isVerified,
      isActive: freelancerProfiles.isActive,
      rating: freelancerProfiles.rating,
      ratingCount: freelancerProfiles.ratingCount,
      totalEarnings: freelancerProfiles.totalEarnings,
      createdAt: freelancerAccounts.createdAt,
    })
      .from(freelancerAccounts)
      .leftJoin(freelancerProfiles, eq(freelancerProfiles.accountId, freelancerAccounts.id))
      .orderBy(desc(freelancerAccounts.createdAt))
      .limit(opts.limit).offset((opts.page - 1) * opts.limit);
  },

  async countFreelancers() {
    const [row] = await db.select({ c: count() }).from(freelancerAccounts);
    return Number(row?.c ?? 0);
  },

  async getFreelancerDetail(profileId: string) {
    return db.select({
      accountId: freelancerAccounts.id,
      email: freelancerAccounts.email,
      displayName: freelancerAccounts.displayName,
      phone: freelancerAccounts.phone,
      status: freelancerAccounts.status,
      bio: freelancerProfiles.bio,
      location: freelancerProfiles.location,
      serviceTypes: freelancerProfiles.serviceTypes,
      avatarUrl: freelancerProfiles.avatarUrl,
      rating: freelancerProfiles.rating,
      ratingCount: freelancerProfiles.ratingCount,
      totalEarnings: freelancerProfiles.totalEarnings,
      isVerified: freelancerProfiles.isVerified,
      isActive: freelancerProfiles.isActive,
    })
      .from(freelancerProfiles)
      .innerJoin(freelancerAccounts, eq(freelancerProfiles.accountId, freelancerAccounts.id))
      .where(eq(freelancerProfiles.id, profileId))
      .limit(1);
  },

  async setFreelancerVerified(profileId: string, isVerified: boolean) {
    const [updated] = await db.update(freelancerProfiles)
      .set({ isVerified, updatedAt: new Date() }).where(eq(freelancerProfiles.id, profileId)).returning();
    return updated;
  },

  async setFreelancerAccountStatus(accountId: string, status: string) {
    const [updated] = await db.update(freelancerAccounts)
      .set({ status, updatedAt: new Date() }).where(eq(freelancerAccounts.id, accountId)).returning();
    return updated;
  },

  async getFreelancerPerformance(profileId: string) {
    const [row] = await db.select({
      total: count(),
      completed: sql<number>`count(*) filter (where ${jobs.status} = 'completed')`,
      cancelled: sql<number>`count(*) filter (where ${jobs.status} = 'cancelled')`,
      avgResponseMs: sql<number>`avg(extract(epoch from (${jobs.respondedAt} - ${jobs.createdAt})) * 1000) filter (where ${jobs.respondedAt} is not null)`,
    }).from(jobs).where(eq(jobs.profileId, profileId));
    return row;
  },

  // ─── Gig moderation ─────────────────────────────────────
  async listServices(opts: { status?: string; page: number; limit: number }) {
    const conds = opts.status ? [eq(freelancerServices.moderationStatus, opts.status)] : [];
    return db.select().from(freelancerServices)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(freelancerServices.createdAt))
      .limit(opts.limit).offset((opts.page - 1) * opts.limit);
  },

  async setServiceModeration(serviceId: string, moderationStatus: string) {
    const [updated] = await db.update(freelancerServices)
      .set({ moderationStatus, updatedAt: new Date() }).where(eq(freelancerServices.id, serviceId)).returning();
    return updated;
  },

  // ─── Earnings / payouts ──────────────────────────────────
  async listEarnings(opts: { payoutStatus?: string; page: number; limit: number }) {
    const conds = opts.payoutStatus ? [eq(earnings.payoutStatus, opts.payoutStatus)] : [];
    return db.select().from(earnings)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(earnings.createdAt))
      .limit(opts.limit).offset((opts.page - 1) * opts.limit);
  },

  async setEarningPayout(earningId: string, payoutStatus: string, payoutRef?: string) {
    const extra: Record<string, unknown> = {};
    if (payoutRef) extra.payoutRef = payoutRef;
    if (payoutStatus === 'paid') extra.paidAt = new Date();
    const [updated] = await db.update(earnings)
      .set({ payoutStatus, ...extra }).where(eq(earnings.id, earningId)).returning();
    return updated;
  },

  async earningsSummary() {
    const [row] = await db.select({
      totalGmv: sql<string>`coalesce(sum(${earnings.amount}), 0)`,
      totalFees: sql<string>`coalesce(sum(${earnings.platformFee}), 0)`,
      totalNetPaid: sql<string>`coalesce(sum(${earnings.netAmount}) filter (where ${earnings.payoutStatus} = 'paid'), 0)`,
      totalNetPending: sql<string>`coalesce(sum(${earnings.netAmount}) filter (where ${earnings.payoutStatus} = 'pending'), 0)`,
    }).from(earnings);
    return row;
  },

  // ─── Support tickets ─────────────────────────────────────
  async listSupportTickets(opts: { status?: string; page: number; limit: number }) {
    const conds = opts.status ? [eq(supportTickets.status, opts.status)] : [];
    return db.select().from(supportTickets)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(supportTickets.createdAt))
      .limit(opts.limit).offset((opts.page - 1) * opts.limit);
  },

  async getSupportTicket(id: string) {
    const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id));
    if (!ticket) return null;
    const messages = await db.select().from(supportMessages)
      .where(eq(supportMessages.ticketId, id)).orderBy(asc(supportMessages.createdAt));
    return { ticket, messages };
  },

  async updateTicket(id: string, data: { status?: string; assignedTo?: string; priority?: string }) {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.status !== undefined) updateData.status = data.status;
    if (data.assignedTo !== undefined) updateData.assignedTo = data.assignedTo;
    if (data.priority !== undefined) updateData.priority = data.priority;
    const [updated] = await db.update(supportTickets)
      .set(updateData).where(eq(supportTickets.id, id)).returning();
    return updated;
  },

  async addAdminTicketMessage(ticketId: string, senderId: string, body: string) {
    const [m] = await db.insert(supportMessages)
      .values({ ticketId, senderId, senderRole: 'admin', body }).returning();
    return m;
  },

  // ─── Review moderation ───────────────────────────────────
  async setReviewStatus(reviewId: string, status: string) {
    const [updated] = await db.update(bookingReviews)
      .set({ status }).where(eq(bookingReviews.id, reviewId)).returning();
    return updated;
  },

  // ─── Summary ─────────────────────────────────────────────
  async marketplaceSummary() {
    const [freelancerRow] = await db.select({ total: count() }).from(freelancerAccounts);
    const [activeRow] = await db.select({ c: count() }).from(freelancerAccounts)
      .where(eq(freelancerAccounts.status, 'active'));
    const [verifiedRow] = await db.select({ c: count() }).from(freelancerProfiles)
      .where(eq(freelancerProfiles.isVerified, true));
    const [servicesRow] = await db.select({ c: count() }).from(freelancerServices)
      .where(eq(freelancerServices.moderationStatus, 'approved'));
    const [jobsRow] = await db.select({ c: count() }).from(jobs);
    const [activeJobsRow] = await db.select({ c: count() }).from(jobs)
      .where(eq(jobs.status, 'accepted'));
    const earningsData = await AdminModel.earningsSummary();
    return {
      totalFreelancers: Number(freelancerRow?.total ?? 0),
      activeFreelancers: Number(activeRow?.c ?? 0),
      verifiedFreelancers: Number(verifiedRow?.c ?? 0),
      approvedServices: Number(servicesRow?.c ?? 0),
      totalJobs: Number(jobsRow?.c ?? 0),
      activeJobs: Number(activeJobsRow?.c ?? 0),
      ...earningsData,
    };
  },
};
