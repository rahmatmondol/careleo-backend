import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import {
  adoptionApplications,
  adoptionPets,
  adoptionQuizResults,
  adoptionShelters,
} from '@/shared/db/schema';

const parseJson = (value?: string | null) => {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

export const AdoptionModel = {
  /** Ensure adoption tables exist in DB for local/dev environments. */
  async ensureTables() {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS adoption_shelters (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(180) NOT NULL,
        city varchar(120),
        state varchar(120),
        country varchar(120),
        address text,
        phone varchar(80),
        email varchar(180),
        description text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS adoption_pets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        shelter_id uuid REFERENCES adoption_shelters(id) ON DELETE SET NULL,
        name varchar(160) NOT NULL,
        type varchar(80) NOT NULL,
        breed varchar(160),
        gender varchar(30),
        age varchar(60),
        size varchar(40),
        color varchar(120),
        description text,
        photo_url text,
        status varchar(30) NOT NULL DEFAULT 'available',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS adoption_applications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        pet_id uuid NOT NULL REFERENCES adoption_pets(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message text,
        status varchar(30) NOT NULL DEFAULT 'pending',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS adoption_quiz_results (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        answers_json text NOT NULL,
        recommended_type varchar(80),
        score varchar(30),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  },

  /** List adoption pets (available by default) with optional type filter. */
  async listPets(type?: string) {
    const where = type
      ? and(eq(adoptionPets.status, 'available'), eq(adoptionPets.type, type))
      : eq(adoptionPets.status, 'available');

    const rows = await db.select().from(adoptionPets).where(where).orderBy(desc(adoptionPets.createdAt));
    return rows;
  },

  /** Get a single adoption pet by id. */
  async getPetById(petId: string) {
    const rows = await db.select().from(adoptionPets).where(eq(adoptionPets.id, petId)).limit(1);
    return rows[0] ?? null;
  },

  /** Create adoption application for a user and pet. */
  async createApplication(userId: string, petId: string, message?: string) {
    const rows = await db
      .insert(adoptionApplications)
      .values({ userId, petId, message, status: 'pending' })
      .returning();
    return rows[0] ?? null;
  },

  /** List adoption applications owned by user. */
  async listApplicationsByUser(userId: string) {
    const rows = await db
      .select()
      .from(adoptionApplications)
      .where(eq(adoptionApplications.userId, userId))
      .orderBy(desc(adoptionApplications.createdAt));
    return rows;
  },

  /** Get one application by id for user scope. */
  async getApplicationById(userId: string, applicationId: string) {
    const rows = await db
      .select()
      .from(adoptionApplications)
      .where(and(eq(adoptionApplications.id, applicationId), eq(adoptionApplications.userId, userId)))
      .limit(1);
    return rows[0] ?? null;
  },

  /** Persist compatibility quiz answers and result. */
  async createQuizResult(userId: string, answers: unknown, recommendedType?: string, score?: string) {
    const rows = await db
      .insert(adoptionQuizResults)
      .values({
        userId,
        answersJson: JSON.stringify(answers ?? {}),
        recommendedType,
        score,
      })
      .returning();

    return rows[0] ?? null;
  },

  /** Get latest quiz result for user. */
  async getLatestQuizResult(userId: string) {
    const rows = await db
      .select()
      .from(adoptionQuizResults)
      .where(eq(adoptionQuizResults.userId, userId))
      .orderBy(desc(adoptionQuizResults.createdAt))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return { ...row, answers: parseJson(row.answersJson) };
  },

  /** List shelters. */
  async listShelters() {
    return db.select().from(adoptionShelters).orderBy(desc(adoptionShelters.createdAt));
  },

  /** Get shelter by id. */
  async getShelterById(shelterId: string) {
    const rows = await db.select().from(adoptionShelters).where(eq(adoptionShelters.id, shelterId)).limit(1);
    return rows[0] ?? null;
  },

  /** Admin: create shelter. */
  async createShelter(payload: {
    name: string;
    city?: string;
    state?: string;
    country?: string;
    address?: string;
    phone?: string;
    email?: string;
    description?: string;
  }) {
    const rows = await db.insert(adoptionShelters).values(payload).returning();
    return rows[0] ?? null;
  },

  /** Admin: create adoption pet listing. */
  async createAdoptionPet(payload: {
    shelterId?: string;
    name: string;
    type: string;
    breed?: string;
    gender?: string;
    age?: string;
    size?: string;
    color?: string;
    description?: string;
    photoUrl?: string;
    status?: string;
  }) {
    const rows = await db
      .insert(adoptionPets)
      .values({ ...payload, status: payload.status ?? 'available' })
      .returning();
    return rows[0] ?? null;
  },

  /** Admin: list all applications (with optional status). */
  async listAllApplications(status?: string) {
    const where = status ? eq(adoptionApplications.status, status) : undefined;
    return db
      .select()
      .from(adoptionApplications)
      .where(where)
      .orderBy(desc(adoptionApplications.createdAt));
  },

  /** Admin: update application status. */
  async updateApplicationStatus(applicationId: string, status: string) {
    await db
      .update(adoptionApplications)
      .set({ status, updatedAt: new Date() })
      .where(eq(adoptionApplications.id, applicationId));

    const rows = await db.select().from(adoptionApplications).where(eq(adoptionApplications.id, applicationId)).limit(1);
    return rows[0] ?? null;
  },
};
