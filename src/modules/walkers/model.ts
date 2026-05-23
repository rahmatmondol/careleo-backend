import { and, desc, eq, ilike, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import { serviceBookingReviews, serviceBookings, sitters, walkers } from '@/shared/db/schema';

export const WalkersModel = {
  /** Ensure required tables exist for local/dev runtime. */
  async ensureTables() {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS walkers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name varchar(180) NOT NULL,
        bio text,
        location varchar(180),
        rating varchar(10) DEFAULT '0',
        hourly_rate varchar(40),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS sitters (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name varchar(180) NOT NULL,
        bio text,
        location varchar(180),
        rating varchar(10) DEFAULT '0',
        daily_rate varchar(40),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS service_bookings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider_type varchar(20) NOT NULL,
        provider_id uuid NOT NULL,
        pet_id uuid,
        schedule_at varchar(40) NOT NULL,
        status varchar(30) NOT NULL DEFAULT 'scheduled',
        notes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS service_booking_reviews (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id uuid NOT NULL REFERENCES service_bookings(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rating varchar(10) NOT NULL,
        comment text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  },

  /** Seed base providers when empty. */
  async ensureSeedData() {
    const walkerCount = (await db.select({ count: sql<number>`count(*)::int` }).from(walkers))[0]?.count ?? 0;
    if (walkerCount === 0) {
      await db.insert(walkers).values([
        { fullName: 'Hasan Walker', location: 'Dhaka', rating: '4.7', hourlyRate: '700' },
        { fullName: 'Nafis Walker', location: 'Dhaka', rating: '4.6', hourlyRate: '650' },
      ]);
    }

    const sitterCount = (await db.select({ count: sql<number>`count(*)::int` }).from(sitters))[0]?.count ?? 0;
    if (sitterCount === 0) {
      await db.insert(sitters).values([
        { fullName: 'Mitu Sitter', location: 'Dhaka', rating: '4.8', dailyRate: '1800' },
        { fullName: 'Rima Sitter', location: 'Chattogram', rating: '4.5', dailyRate: '1600' },
      ]);
    }
  },

  async listWalkers(location?: string) {
    const where = location ? ilike(walkers.location, `%${location}%`) : undefined;
    return db.select().from(walkers).where(where).orderBy(desc(walkers.createdAt));
  },

  async getWalkerById(id: string) {
    const rows = await db.select().from(walkers).where(eq(walkers.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async listSitters(location?: string) {
    const where = location ? ilike(sitters.location, `%${location}%`) : undefined;
    return db.select().from(sitters).where(where).orderBy(desc(sitters.createdAt));
  },

  async getSitterById(id: string) {
    const rows = await db.select().from(sitters).where(eq(sitters.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async createBooking(payload: {
    userId: string;
    providerType: 'walker' | 'sitter';
    providerId: string;
    petId?: string;
    scheduleAt: string;
    notes?: string;
  }) {
    const rows = await db.insert(serviceBookings).values(payload).returning();
    return rows[0] ?? null;
  },

  async listBookingsByUser(userId: string) {
    return db.select().from(serviceBookings).where(eq(serviceBookings.userId, userId)).orderBy(desc(serviceBookings.createdAt));
  },

  async getBookingById(userId: string, bookingId: string) {
    const rows = await db
      .select()
      .from(serviceBookings)
      .where(and(eq(serviceBookings.id, bookingId), eq(serviceBookings.userId, userId)))
      .limit(1);
    return rows[0] ?? null;
  },

  async updateBookingById(userId: string, bookingId: string, payload: Record<string, unknown>) {
    await db
      .update(serviceBookings)
      .set({ ...payload, updatedAt: new Date() })
      .where(and(eq(serviceBookings.id, bookingId), eq(serviceBookings.userId, userId)));
    return this.getBookingById(userId, bookingId);
  },

  async deleteBookingById(userId: string, bookingId: string) {
    await db.delete(serviceBookings).where(and(eq(serviceBookings.id, bookingId), eq(serviceBookings.userId, userId)));
  },

  async createBookingReview(userId: string, bookingId: string, rating: string, comment?: string) {
    const rows = await db.insert(serviceBookingReviews).values({ userId, bookingId, rating, comment }).returning();
    return rows[0] ?? null;
  },
};
