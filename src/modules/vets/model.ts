import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import { pets, users, vetAppointments, vetAvailability, vetPrescriptions, vetReviews, vetServices, vets } from '@/shared/db/schema';

const parseJson = (value?: string | null) => {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
};

/**
 * DB access for the vets module.
 *
 * This used to open with `ensureTables()` — six `CREATE TABLE IF NOT EXISTS`
 * statements re-run on every request via `ensureReady()` — plus a seed insert.
 * Both are gone. The tables come from migration `0002_overconfident_young_avengers`,
 * and keeping a second hand-written copy of the DDL had already gone wrong: the
 * inline `vet_appointments` was missing `follow_up_at`, so on any database where
 * it won the race the column simply did not exist. Seeding now lives in
 * `scripts/seed-vets.ts`, run on purpose rather than on the first request.
 */
export const VetsModel = {
  /**
   * List vets with optional filters.
   *
   * The filters used to be a chain of either/ors where `search` shadowed the
   * rest, so "cardiology vets in Dhaka" quietly ignored the location as soon as
   * a search term was present. They now combine.
   */
  async listVets(filters: { search?: string; location?: string; specialty?: string; status?: string }) {
    const conds = [];
    if (filters.search) {
      conds.push(or(ilike(vets.fullName, `%${filters.search}%`), ilike(vets.specialty, `%${filters.search}%`)));
    }
    if (filters.location) conds.push(ilike(vets.location, `%${filters.location}%`));
    if (filters.specialty) conds.push(ilike(vets.specialty, `%${filters.specialty}%`));
    if (filters.status) conds.push(eq(vets.status, filters.status));
    const where = conds.length ? and(...conds) : undefined;

    return db.select().from(vets).where(where).orderBy(desc(vets.createdAt));
  },

  /** Find a single vet by id. */
  async getVetById(vetId: string) {
    const rows = await db.select().from(vets).where(eq(vets.id, vetId)).limit(1);
    return rows[0] ?? null;
  },

  /**
   * List reviews for vet, with the reviewer's name.
   *
   * Joined because the raw rows carry only `user_id`, and a review attributed to
   * a UUID is not something you can put on a profile screen.
   */
  async listVetReviews(vetId: string) {
    return db
      .select({
        id: vetReviews.id,
        vetId: vetReviews.vetId,
        userId: vetReviews.userId,
        rating: vetReviews.rating,
        comment: vetReviews.comment,
        createdAt: vetReviews.createdAt,
        authorFirstName: users.firstName,
        authorLastName: users.lastName,
        authorAvatarUrl: users.avatarUrl,
      })
      .from(vetReviews)
      .leftJoin(users, eq(vetReviews.userId, users.id))
      .where(eq(vetReviews.vetId, vetId))
      .orderBy(desc(vetReviews.createdAt));
  },

  /** List services for vet. */
  async listVetServices(vetId: string) {
    return db.select().from(vetServices).where(eq(vetServices.vetId, vetId)).orderBy(desc(vetServices.createdAt));
  },

  /** List availability slots for vet. */
  async listVetAvailability(vetId: string) {
    return db.select().from(vetAvailability).where(eq(vetAvailability.vetId, vetId)).orderBy(desc(vetAvailability.createdAt));
  },

  /**
   * Appointment times already taken for a vet on one calendar day.
   *
   * `appointment_at` is a varchar holding a wall-clock ISO string
   * (`2026-08-06T10:30:00`), not a timestamp, so a date-prefix match is an exact
   * day filter with no timezone conversion in the middle. Cancelled slots are
   * excluded so they free up again.
   */
  async bookedAppointmentTimes(vetId: string, date: string) {
    const rows = await db
      .select({ appointmentAt: vetAppointments.appointmentAt })
      .from(vetAppointments)
      .where(
        and(
          eq(vetAppointments.vetId, vetId),
          ilike(vetAppointments.appointmentAt, `${date}%`),
          sql`${vetAppointments.status} NOT IN ('cancelled', 'completed')`,
        ),
      );
    return rows.map((r) => r.appointmentAt);
  },

  /** Create appointment. */
  async createAppointment(payload: {
    vetId: string;
    userId: string;
    petId?: string;
    type: string;
    appointmentAt: string;
    reason?: string;
    notes?: string;
  }) {
    const rows = await db.insert(vetAppointments).values(payload).returning();
    return rows[0] ?? null;
  },

  /** List appointments for user. */
  async listAppointmentsByUser(userId: string) {
    return db.select().from(vetAppointments).where(eq(vetAppointments.userId, userId)).orderBy(desc(vetAppointments.createdAt));
  },

  /** Get one appointment for user scope. */
  async getAppointmentById(userId: string, appointmentId: string) {
    const rows = await db
      .select()
      .from(vetAppointments)
      .where(and(eq(vetAppointments.id, appointmentId), eq(vetAppointments.userId, userId)))
      .limit(1);
    return rows[0] ?? null;
  },

  /** Update appointment for user scope. */
  async updateAppointmentById(userId: string, appointmentId: string, values: Record<string, unknown>) {
    await db
      .update(vetAppointments)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(vetAppointments.id, appointmentId), eq(vetAppointments.userId, userId)));

    return this.getAppointmentById(userId, appointmentId);
  },

  /** Delete appointment for user scope. */
  async deleteAppointmentById(userId: string, appointmentId: string) {
    await db.delete(vetAppointments).where(and(eq(vetAppointments.id, appointmentId), eq(vetAppointments.userId, userId)));
  },

  /** Create review for vet. */
  async createReview(userId: string, vetId: string, rating: string, comment?: string) {
    const rows = await db.insert(vetReviews).values({ userId, vetId, rating, comment }).returning();
    return rows[0] ?? null;
  },

  /** Update review if owned by user. */
  async updateReview(userId: string, reviewId: string, rating?: string, comment?: string) {
    await db
      .update(vetReviews)
      .set({ rating, comment, updatedAt: new Date() })
      .where(and(eq(vetReviews.id, reviewId), eq(vetReviews.userId, userId)));

    const rows = await db
      .select()
      .from(vetReviews)
      .where(and(eq(vetReviews.id, reviewId), eq(vetReviews.userId, userId)))
      .limit(1);
    return rows[0] ?? null;
  },

  /** Delete review if owned by user. */
  async deleteReview(userId: string, reviewId: string) {
    await db.delete(vetReviews).where(and(eq(vetReviews.id, reviewId), eq(vetReviews.userId, userId)));
  },

  /** List prescriptions for user. */
  async listPrescriptionsByUser(userId: string) {
    const rows = await db
      .select()
      .from(vetPrescriptions)
      .where(eq(vetPrescriptions.userId, userId))
      .orderBy(desc(vetPrescriptions.createdAt));
    return rows.map((row) => ({ ...row, medicines: parseJson(row.medicinesJson) }));
  },

  /** Get one prescription for user. */
  async getPrescriptionById(userId: string, prescriptionId: string) {
    const rows = await db
      .select()
      .from(vetPrescriptions)
      .where(and(eq(vetPrescriptions.id, prescriptionId), eq(vetPrescriptions.userId, userId)))
      .limit(1);
    const row = rows[0];
    return row ? { ...row, medicines: parseJson(row.medicinesJson) } : null;
  },

  /** Increment prescription refill count. */
  async refillPrescription(userId: string, prescriptionId: string) {
    const current = await this.getPrescriptionById(userId, prescriptionId);
    if (!current) return null;
    const next = String((Number(current.refillCount ?? '0') || 0) + 1);
    await db
      .update(vetPrescriptions)
      .set({ refillCount: next, updatedAt: new Date() })
      .where(and(eq(vetPrescriptions.id, prescriptionId), eq(vetPrescriptions.userId, userId)));
    return this.getPrescriptionById(userId, prescriptionId);
  },

  // ─── Admin ─────────────────────────────────────────────────────────────────
  // Everything below is reached only through `/vets/admin/*`, which requires the
  // `vets.read` / `vets.write` permissions. The customer-facing methods above
  // are all scoped by `userId`; these deliberately are not.

  /** Admin vet list: free-text search across name/specialty/email, plus filters. */
  async adminListVets(opts: {
    search?: string;
    status?: string;
    specialty?: string;
    limit: number;
    offset: number;
  }) {
    const conds = [];
    if (opts.search) {
      conds.push(
        or(
          ilike(vets.fullName, `%${opts.search}%`),
          ilike(vets.specialty, `%${opts.search}%`),
          ilike(vets.email, `%${opts.search}%`),
        ),
      );
    }
    if (opts.status) conds.push(eq(vets.status, opts.status));
    if (opts.specialty) conds.push(ilike(vets.specialty, `%${opts.specialty}%`));
    const where = conds.length ? and(...conds) : undefined;

    const [rows, [countRow]] = await Promise.all([
      db.select().from(vets).where(where).orderBy(desc(vets.createdAt)).limit(opts.limit).offset(opts.offset),
      db.select({ count: sql<number>`count(*)::int` }).from(vets).where(where),
    ]);

    return { rows, total: countRow?.count ?? 0 };
  },

  async createVet(values: Record<string, unknown>) {
    const rows = await db.insert(vets).values(values as any).returning();
    return rows[0] ?? null;
  },

  async updateVet(vetId: string, values: Record<string, unknown>) {
    const rows = await db
      .update(vets)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(vets.id, vetId))
      .returning();
    return rows[0] ?? null;
  },

  /** Cascades to services, availability, reviews and appointments by FK. */
  async deleteVet(vetId: string) {
    await db.delete(vets).where(eq(vets.id, vetId));
  },

  /**
   * Review count and appointment tallies for one vet, for the admin detail page.
   *
   * Three counts in one round trip rather than three queries; the grouped
   * appointment counts come back as a status → count map so the caller does not
   * have to know which statuses exist.
   */
  async adminVetStats(vetId: string) {
    const [reviewRows, appointmentRows] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(vetReviews).where(eq(vetReviews.vetId, vetId)),
      db
        .select({ status: vetAppointments.status, count: sql<number>`count(*)::int` })
        .from(vetAppointments)
        .where(eq(vetAppointments.vetId, vetId))
        .groupBy(vetAppointments.status),
    ]);

    const byStatus = appointmentRows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = Number(r.count);
      return acc;
    }, {});

    return {
      reviewsCount: reviewRows[0]?.count ?? 0,
      appointmentsByStatus: byStatus,
      totalAppointments: Object.values(byStatus).reduce((a, b) => a + b, 0),
    };
  },

  /**
   * Admin appointment list across every vet and user.
   *
   * Joined rather than bare: the admin table shows pet, owner and vet names, and
   * three columns of UUIDs would be unreadable. `pets` is a LEFT join because
   * `pet_id` is nullable and carries no foreign key, so it can point at a pet
   * that has since been deleted — that appointment must still list.
   */
  async adminListAppointments(opts: {
    vetId?: string;
    userId?: string;
    status?: string;
    type?: string;
    limit: number;
    offset: number;
  }) {
    const conds = [];
    if (opts.vetId) conds.push(eq(vetAppointments.vetId, opts.vetId));
    if (opts.userId) conds.push(eq(vetAppointments.userId, opts.userId));
    if (opts.status) conds.push(eq(vetAppointments.status, opts.status));
    if (opts.type) conds.push(eq(vetAppointments.type, opts.type));
    const where = conds.length ? and(...conds) : undefined;

    const [rows, [countRow]] = await Promise.all([
      db
        .select({
          id: vetAppointments.id,
          vetId: vetAppointments.vetId,
          userId: vetAppointments.userId,
          petId: vetAppointments.petId,
          type: vetAppointments.type,
          status: vetAppointments.status,
          appointmentAt: vetAppointments.appointmentAt,
          reason: vetAppointments.reason,
          notes: vetAppointments.notes,
          followUpAt: vetAppointments.followUpAt,
          createdAt: vetAppointments.createdAt,
          vetName: vets.fullName,
          consultationFee: vets.consultationFee,
          petName: pets.name,
          ownerFirstName: users.firstName,
          ownerLastName: users.lastName,
          ownerEmail: users.email,
          ownerPhone: users.phone,
        })
        .from(vetAppointments)
        .leftJoin(vets, eq(vetAppointments.vetId, vets.id))
        .leftJoin(users, eq(vetAppointments.userId, users.id))
        .leftJoin(pets, eq(vetAppointments.petId, pets.id))
        .where(where)
        .orderBy(desc(vetAppointments.appointmentAt))
        .limit(opts.limit)
        .offset(opts.offset),
      db.select({ count: sql<number>`count(*)::int` }).from(vetAppointments).where(where),
    ]);

    return { rows, total: countRow?.count ?? 0 };
  },

  /** Admin appointment update — not scoped to an owner, unlike the customer path. */
  async adminUpdateAppointment(appointmentId: string, values: Record<string, unknown>) {
    const rows = await db
      .update(vetAppointments)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(vetAppointments.id, appointmentId))
      .returning();
    return rows[0] ?? null;
  },

  // ─── Availability (admin-managed) ──────────────────────────────────────────

  async getAvailabilityById(availabilityId: string) {
    const rows = await db.select().from(vetAvailability).where(eq(vetAvailability.id, availabilityId)).limit(1);
    return rows[0] ?? null;
  },

  async createAvailability(values: { vetId: string; dayOfWeek: string; startTime: string; endTime: string; mode?: string }) {
    const rows = await db.insert(vetAvailability).values(values).returning();
    return rows[0] ?? null;
  },

  async updateAvailability(availabilityId: string, values: Record<string, unknown>) {
    const rows = await db
      .update(vetAvailability)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(vetAvailability.id, availabilityId))
      .returning();
    return rows[0] ?? null;
  },

  async deleteAvailability(availabilityId: string) {
    await db.delete(vetAvailability).where(eq(vetAvailability.id, availabilityId));
  },

  // ─── Services (admin-managed) ──────────────────────────────────────────────

  async getServiceById(serviceId: string) {
    const rows = await db.select().from(vetServices).where(eq(vetServices.id, serviceId)).limit(1);
    return rows[0] ?? null;
  },

  async createService(values: { vetId: string; name: string; description?: string; fee?: string }) {
    const rows = await db.insert(vetServices).values(values).returning();
    return rows[0] ?? null;
  },

  async updateService(serviceId: string, values: Record<string, unknown>) {
    const rows = await db
      .update(vetServices)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(vetServices.id, serviceId))
      .returning();
    return rows[0] ?? null;
  },

  async deleteService(serviceId: string) {
    await db.delete(vetServices).where(eq(vetServices.id, serviceId));
  },
};
