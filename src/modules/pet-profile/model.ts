import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/shared/db';
import { petFacts, petProfiles } from '@/shared/db/schema';

export type PetProfileRow = typeof petProfiles.$inferSelect;
export type PetFactRow = typeof petFacts.$inferSelect;

/** Structured profile fields that count toward completeness. */
const COMPLETENESS_FIELDS: (keyof PetProfileRow)[] = [
  'dietBrand',
  'dietType',
  'dailyAmount',
  'activityLevel',
  'allergies',
  'healthConditions',
  'vaccinationStatus',
];

/** 0-100 score: how much of the structured profile is filled in. */
export const computeCompleteness = (p: Partial<PetProfileRow>): number => {
  let filled = 0;
  for (const f of COMPLETENESS_FIELDS) {
    const v = p[f];
    if (Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== '') filled++;
  }
  return Math.round((filled / COMPLETENESS_FIELDS.length) * 100);
};

export const PetProfileModel = {
  // ── Profile ────────────────────────────────────────────────────────────────
  getProfile: async (petId: string): Promise<PetProfileRow | undefined> => {
    const [row] = await db.select().from(petProfiles).where(eq(petProfiles.petId, petId));
    return row;
  },

  /** Insert-or-update the single profile row for a pet, recomputing completeness. */
  upsertProfile: async (
    petId: string,
    patch: Partial<Omit<PetProfileRow, 'id' | 'petId' | 'createdAt' | 'updatedAt' | 'completeness'>>,
  ): Promise<PetProfileRow> => {
    const existing = await PetProfileModel.getProfile(petId);
    const merged = { ...(existing ?? {}), ...patch };
    const completeness = computeCompleteness(merged as Partial<PetProfileRow>);

    if (existing) {
      const [row] = await db
        .update(petProfiles)
        .set({ ...patch, completeness, updatedAt: new Date() })
        .where(eq(petProfiles.petId, petId))
        .returning();
      return row;
    }
    const [row] = await db
      .insert(petProfiles)
      .values({ petId, ...patch, completeness })
      .returning();
    return row;
  },

  // ── Facts ────────────────────────────────────────────────────────────────
  /** Active facts (not superseded), newest first. */
  listFacts: async (
    petId: string,
    opts: { activeOnly?: boolean; limit?: number } = {},
  ): Promise<PetFactRow[]> => {
    const { activeOnly = true, limit } = opts;
    const where = activeOnly
      ? and(eq(petFacts.petId, petId), isNull(petFacts.supersededBy))
      : eq(petFacts.petId, petId);
    const q = db.select().from(petFacts).where(where).orderBy(desc(petFacts.createdAt));
    const rows = limit ? await q.limit(limit) : await q;
    return rows;
  },

  addFact: async (input: {
    petId: string;
    fact: string;
    category?: string;
    source?: string;
    sessionId?: string | null;
    confidence?: number;
  }): Promise<PetFactRow> => {
    const [row] = await db
      .insert(petFacts)
      .values({
        petId: input.petId,
        fact: input.fact,
        category: input.category ?? 'other',
        source: input.source ?? 'chat',
        sessionId: input.sessionId ?? null,
        confidence: input.confidence !== undefined ? String(input.confidence) : undefined,
      })
      .returning();
    return row;
  },

  /** Mark an old fact as superseded by a newer one (history preserved). */
  supersedeFact: async (oldId: string, newId: string): Promise<void> => {
    await db.update(petFacts).set({ supersededBy: newId }).where(eq(petFacts.id, oldId));
  },

  deleteFact: async (petId: string, factId: string): Promise<void> => {
    await db.delete(petFacts).where(and(eq(petFacts.id, factId), eq(petFacts.petId, petId)));
  },
};
