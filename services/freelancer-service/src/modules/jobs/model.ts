import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import { jobs, bookings, freelancerServices } from '../../db/schema';

export const JobsModel = {
  async insert(values: {
    customerId: string; customerEmail: string; petId: string; petName?: string;
    profileId: string; serviceId?: string; message?: string; proposedSchedule?: string;
    agreedPrice?: string; mode?: string;
  }) {
    const [job] = await db.insert(jobs).values(values).returning();
    return job;
  },

  async findById(id: string) {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    return job ?? null;
  },

  async listByCustomer(customerId: string) {
    return db.select().from(jobs).where(eq(jobs.customerId, customerId)).orderBy(desc(jobs.createdAt));
  },

  async listByProfile(profileId: string, status?: string) {
    const conds = [eq(jobs.profileId, profileId)];
    if (status) conds.push(eq(jobs.status, status));
    return db.select().from(jobs).where(and(...conds)).orderBy(desc(jobs.createdAt));
  },

  async setStatus(id: string, status: string, extra: Record<string, unknown> = {}) {
    const [updated] = await db.update(jobs).set({ status, ...extra }).where(eq(jobs.id, id)).returning();
    return updated;
  },

  /** How many manual hires a customer started this calendar month (entitlement aid). */
  async countCustomerHiresThisMonth(customerId: string) {
    const [row] = await db.select({ c: sql<number>`count(*)` }).from(jobs)
      .where(and(
        eq(jobs.customerId, customerId),
        eq(jobs.mode, 'manual'),
        sql`${jobs.createdAt} >= date_trunc('month', now())`,
      ));
    return Number(row?.c ?? 0);
  },

  async createBooking(values: { jobId: string; customerId: string; profileId: string; scheduleAt?: Date | null }) {
    const [b] = await db.insert(bookings).values(values).returning();
    return b;
  },

  async getServicePrice(serviceId: string) {
    const [s] = await db.select({ price: freelancerServices.price }).from(freelancerServices)
      .where(eq(freelancerServices.id, serviceId));
    return s?.price ?? null;
  },
};
