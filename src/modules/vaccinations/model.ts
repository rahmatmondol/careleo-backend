import { and, desc, eq, lte, isNotNull } from 'drizzle-orm';
import { db } from '@/shared/db';
import { vaccinations } from '@/shared/db/schema';

export type VaccinationRow = typeof vaccinations.$inferSelect;

export const VaccinationsModel = {
  listForPet: async (petId: string): Promise<VaccinationRow[]> =>
    db.select().from(vaccinations).where(eq(vaccinations.petId, petId)).orderBy(desc(vaccinations.createdAt)),

  getById: async (id: string): Promise<VaccinationRow | undefined> => {
    const [row] = await db.select().from(vaccinations).where(eq(vaccinations.id, id));
    return row;
  },

  create: async (input: {
    petId: string;
    userId: string;
    vaccineName: string;
    givenAt?: string | null;
    dueAt?: string | null;
    status?: string;
    notes?: string | null;
  }): Promise<VaccinationRow> => {
    const [row] = await db
      .insert(vaccinations)
      .values({
        petId: input.petId,
        userId: input.userId,
        vaccineName: input.vaccineName,
        givenAt: input.givenAt ?? null,
        dueAt: input.dueAt ?? null,
        status: input.status ?? 'due',
        notes: input.notes ?? null,
      })
      .returning();
    return row;
  },

  update: async (
    id: string,
    patch: Partial<{ status: string; givenAt: string | null; dueAt: string | null; notes: string | null; lastRemindedAt: Date }>,
  ): Promise<VaccinationRow | undefined> => {
    const [row] = await db
      .update(vaccinations)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(vaccinations.id, id))
      .returning();
    return row;
  },

  /** Vaccinations due on/before `cutoff` (ISO date string compare) that are not completed. */
  findDue: async (cutoffIso: string): Promise<VaccinationRow[]> =>
    db
      .select()
      .from(vaccinations)
      .where(
        and(
          isNotNull(vaccinations.dueAt),
          lte(vaccinations.dueAt, cutoffIso),
          eq(vaccinations.status, 'due'),
        ),
      ),
};
