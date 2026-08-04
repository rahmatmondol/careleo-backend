import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import { medicalRecords, petPreferences, pets, users } from '@/shared/db/schema';

const parseJsonArray = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
  } catch {
    return [];
  }
};

export const PetsModel = {
  /** Create a pet for the authenticated user. */
  async createPet(payload: {
    userId: string;
    name: string;
    type: string;
    breed?: string;
    gender?: string;
    dob?: string;
    weight?: number;
    photoUrl?: string;
    color?: string;
    microchipId?: string;
    description?: string;
  }) {
    const rows = await db
      .insert(pets)
      .values({
        userId: payload.userId,
        name: payload.name,
        type: payload.type,
        breed: payload.breed,
        gender: payload.gender,
        dob: payload.dob,
        weight: payload.weight !== undefined ? String(payload.weight) : undefined,
        photoUrl: payload.photoUrl,
        color: payload.color,
        microchipId: payload.microchipId,
        description: payload.description,
      })
      .returning();

    return rows[0] ?? null;
  },

  /** List all pets for the authenticated user. */
  async listByUser(userId: string) {
    return db.select().from(pets).where(eq(pets.userId, userId)).orderBy(desc(pets.createdAt));
  },

  /** List all pets across system for admin panel with owner info. */
  async listAllForAdmin() {
    return db
      .select({
        id: pets.id,
        name: pets.name,
        type: pets.type,
        breed: pets.breed,
        gender: pets.gender,
        dob: pets.dob,
        weight: pets.weight,
        photoUrl: pets.photoUrl,
        createdAt: pets.createdAt,
        updatedAt: pets.updatedAt,
        ownerId: users.id,
        ownerName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
        ownerEmail: users.email,
        ownerAvatar: users.avatarUrl,
      })
      .from(pets)
      .leftJoin(users, eq(pets.userId, users.id))
      .orderBy(desc(pets.createdAt));
  },

  /** Find user-owned pet by name (case-insensitive, trimmed input). */
  async findByName(userId: string, name: string) {
    const normalizedName = name.trim().toLowerCase();
    const rows = await db
      .select()
      .from(pets)
      .where(and(eq(pets.userId, userId), sql`LOWER(${pets.name}) = ${normalizedName}`))
      .limit(1);

    return rows[0] ?? null;
  },

  /** Find user-owned pet by name excluding a specific pet id. */
  async findByNameExcludingId(userId: string, name: string, petId: string) {
    const normalizedName = name.trim().toLowerCase();
    const rows = await db
      .select()
      .from(pets)
      .where(and(eq(pets.userId, userId), sql`LOWER(${pets.name}) = ${normalizedName}`, sql`${pets.id} <> ${petId}`))
      .limit(1);

    return rows[0] ?? null;
  },

  /** Fetch a single user-owned pet by id. */
  async getById(userId: string, petId: string) {
    const rows = await db
      .select()
      .from(pets)
      .where(and(eq(pets.id, petId), eq(pets.userId, userId)))
      .limit(1);
    return rows[0] ?? null;
  },

  /** Update a user-owned pet by id. */
  async updateById(
    userId: string,
    petId: string,
    payload: {
      name?: string;
      type?: string;
      breed?: string;
      gender?: string;
      dob?: string;
      weight?: number;
      photoUrl?: string;
      color?: string;
      microchipId?: string;
      description?: string;
    },
  ) {
    await db
      .update(pets)
      .set({
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.type !== undefined ? { type: payload.type } : {}),
        ...(payload.breed !== undefined ? { breed: payload.breed } : {}),
        ...(payload.gender !== undefined ? { gender: payload.gender } : {}),
        ...(payload.dob !== undefined ? { dob: payload.dob } : {}),
        ...(payload.weight !== undefined ? { weight: String(payload.weight) } : {}),
        ...(payload.photoUrl !== undefined ? { photoUrl: payload.photoUrl } : {}),
        ...(payload.color !== undefined ? { color: payload.color } : {}),
        ...(payload.microchipId !== undefined ? { microchipId: payload.microchipId } : {}),
        ...(payload.description !== undefined ? { description: payload.description } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(pets.id, petId), eq(pets.userId, userId)));

    return this.getById(userId, petId);
  },

  /** Delete a user-owned pet by id. */
  async deleteById(userId: string, petId: string) {
    const rows = await db
      .delete(pets)
      .where(and(eq(pets.id, petId), eq(pets.userId, userId)))
      .returning({ id: pets.id });
    return rows[0] ?? null;
  },

  /** Create medical record for a user-owned pet. */
  async addMedicalRecord(
    userId: string,
    petId: string,
    payload: { title: string; description?: string; date: string; vetName?: string; attachments?: string[] },
  ) {
    const pet = await this.getById(userId, petId);
    if (!pet) return null;

    const rows = await db
      .insert(medicalRecords)
      .values({
        petId,
        title: payload.title,
        description: payload.description,
        date: payload.date,
        vetName: payload.vetName,
        attachmentsJson: payload.attachments ? JSON.stringify(payload.attachments) : undefined,
      })
      .returning();

    return rows[0] ?? null;
  },

  /** List medical records for a user-owned pet. */
  async listMedicalRecords(userId: string, petId: string) {
    const pet = await this.getById(userId, petId);
    if (!pet) return null;

    const rows = await db
      .select()
      .from(medicalRecords)
      .where(eq(medicalRecords.petId, petId))
      .orderBy(desc(medicalRecords.date), desc(medicalRecords.createdAt));

    return rows.map((row) => ({ ...row, attachments: parseJsonArray(row.attachmentsJson) }));
  },

  /** Get preferences for a user-owned pet. */
  async getPreferences(userId: string, petId: string) {
    const rows = await db.select().from(petPreferences).where(eq(petPreferences.petId, petId)).limit(1);
    return rows[0];
  },

  /** Upsert preferences for a user-owned pet. */
  async upsertPreferences(
    userId: string,
    petId: string,
    payload: { dietType?: string; activityLevel?: string; healthConditions?: string },
  ) {
    const pet = await this.getById(userId, petId);
    if (!pet) return null;

    const existing = await this.getPreferences(userId, petId);
    if (existing) {
      await db
        .update(petPreferences)
        .set({
          ...(payload.dietType !== undefined ? { dietType: payload.dietType } : {}),
          ...(payload.activityLevel !== undefined ? { activityLevel: payload.activityLevel } : {}),
          ...(payload.healthConditions !== undefined ? { healthConditions: payload.healthConditions } : {}),
          updatedAt: new Date(),
        })
        .where(eq(petPreferences.id, existing.id));

      return this.getPreferences(userId, petId);
    }

    const rows = await db
      .insert(petPreferences)
      .values({
        petId,
        dietType: payload.dietType,
        activityLevel: payload.activityLevel,
        healthConditions: payload.healthConditions,
      })
      .returning();

    return rows[0] ?? null;
  },
};
