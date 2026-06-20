import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { bookings, bookingReviews } from '../../db/schema';

export const BookingsModel = {
  async findById(id: string) {
    const [b] = await db.select().from(bookings).where(eq(bookings.id, id));
    return b ?? null;
  },

  async listByCustomer(customerId: string) {
    return db.select().from(bookings).where(eq(bookings.customerId, customerId)).orderBy(desc(bookings.createdAt));
  },

  async listByProfile(profileId: string) {
    return db.select().from(bookings).where(eq(bookings.profileId, profileId)).orderBy(desc(bookings.createdAt));
  },

  async setStatus(id: string, status: string) {
    const [updated] = await db.update(bookings)
      .set({ status, updatedAt: new Date() }).where(eq(bookings.id, id)).returning();
    return updated;
  },

  async insertReview(values: {
    bookingId: string; customerId: string; profileId: string; rating: number; comment?: string;
  }) {
    const [r] = await db.insert(bookingReviews).values(values).returning();
    return r;
  },

  async findReviewByBooking(bookingId: string) {
    const [r] = await db.select().from(bookingReviews).where(eq(bookingReviews.bookingId, bookingId));
    return r ?? null;
  },
};
