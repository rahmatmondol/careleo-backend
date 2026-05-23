import { and, desc, eq, ilike, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import { vetAppointments, vetAvailability, vetPrescriptions, vetReviews, vetServices, vets } from '@/shared/db/schema';

const parseJson = (value?: string | null) => {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
};

export const VetsModel = {
  /** Ensure required vet module tables exist for local/dev runtime. */
  async ensureTables() {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name varchar(180) NOT NULL,
        bio text,
        specialty varchar(120),
        location varchar(180),
        rating varchar(10) DEFAULT '0',
        consultation_fee varchar(40),
        avatar_url text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vet_services (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        vet_id uuid NOT NULL REFERENCES vets(id) ON DELETE CASCADE,
        name varchar(160) NOT NULL,
        description text,
        fee varchar(40),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vet_availability (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        vet_id uuid NOT NULL REFERENCES vets(id) ON DELETE CASCADE,
        day_of_week varchar(20) NOT NULL,
        start_time varchar(20) NOT NULL,
        end_time varchar(20) NOT NULL,
        mode varchar(20) DEFAULT 'both',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vet_reviews (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        vet_id uuid NOT NULL REFERENCES vets(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rating varchar(10) NOT NULL,
        comment text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vet_appointments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        vet_id uuid NOT NULL REFERENCES vets(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        pet_id uuid,
        type varchar(20) NOT NULL,
        status varchar(30) NOT NULL DEFAULT 'scheduled',
        appointment_at varchar(40) NOT NULL,
        reason text,
        notes text,
        call_token text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vet_prescriptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        appointment_id uuid NOT NULL REFERENCES vet_appointments(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        vet_id uuid NOT NULL REFERENCES vets(id) ON DELETE CASCADE,
        medicines_json text NOT NULL,
        instructions text,
        refill_count varchar(10) DEFAULT '0',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  },

  /** Seed minimal vet data if table is empty. */
  async ensureSeedData() {
    const countRows = await db.select({ count: sql<number>`count(*)::int` }).from(vets);
    const count = countRows[0]?.count ?? 0;
    if (count > 0) return;

    const vetRows = await db
      .insert(vets)
      .values([
        { fullName: 'Dr. Sarah Ahmed', specialty: 'General Practice', location: 'Dhaka', rating: '4.8', consultationFee: '1200' },
        { fullName: 'Dr. Tanvir Hasan', specialty: 'Dermatology', location: 'Chattogram', rating: '4.6', consultationFee: '1500' },
      ])
      .returning();

    if (vetRows[0]) {
      await db.insert(vetServices).values([
        { vetId: vetRows[0].id, name: 'General Checkup', fee: '1200' },
        { vetId: vetRows[0].id, name: 'Vaccination', fee: '800' },
      ]);
      await db.insert(vetAvailability).values([
        { vetId: vetRows[0].id, dayOfWeek: 'Monday', startTime: '10:00', endTime: '17:00', mode: 'both' },
        { vetId: vetRows[0].id, dayOfWeek: 'Tuesday', startTime: '10:00', endTime: '17:00', mode: 'both' },
      ]);
    }
  },

  /** List vets with optional filters. */
  async listVets(filters: { search?: string; location?: string; specialty?: string }) {
    const where = filters.search
      ? ilike(vets.fullName, `%${filters.search}%`)
      : filters.location && filters.specialty
      ? and(ilike(vets.location, `%${filters.location}%`), ilike(vets.specialty, `%${filters.specialty}%`))
      : filters.location
      ? ilike(vets.location, `%${filters.location}%`)
      : filters.specialty
      ? ilike(vets.specialty, `%${filters.specialty}%`)
      : undefined;

    return db.select().from(vets).where(where).orderBy(desc(vets.createdAt));
  },

  /** Find a single vet by id. */
  async getVetById(vetId: string) {
    const rows = await db.select().from(vets).where(eq(vets.id, vetId)).limit(1);
    return rows[0] ?? null;
  },

  /** List reviews for vet. */
  async listVetReviews(vetId: string) {
    return db.select().from(vetReviews).where(eq(vetReviews.vetId, vetId)).orderBy(desc(vetReviews.createdAt));
  },

  /** List services for vet. */
  async listVetServices(vetId: string) {
    return db.select().from(vetServices).where(eq(vetServices.vetId, vetId)).orderBy(desc(vetServices.createdAt));
  },

  /** List availability slots for vet. */
  async listVetAvailability(vetId: string) {
    return db.select().from(vetAvailability).where(eq(vetAvailability.vetId, vetId)).orderBy(desc(vetAvailability.createdAt));
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
};
