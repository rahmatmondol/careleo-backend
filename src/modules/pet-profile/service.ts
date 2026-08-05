import { GoogleGenerativeAI } from '@google/generative-ai';
import { NotFoundError } from '@/shared/errors';
import { PetsModel } from '@/modules/pets/model';
import { getModelForPurpose, recordTokenUsage } from '@/modules/ai/model-registry';
import { PetProfileModel, type PetProfileRow } from './model';

const VALID_CATEGORIES = ['diet', 'health', 'activity', 'behavior', 'preference', 'other'];

/** Strip markdown fences and parse a JSON payload from a model response. */
const parseJson = (text: string): any => {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fall back to the first {...} or [...] block.
    const match = cleaned.match(/[[{][\s\S]*[\]}]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
};

/** Ensure the pet belongs to the user; throws 404 otherwise. Returns the pet. */
const assertOwnership = async (userId: string, petId: string) => {
  const pet = await PetsModel.getById(userId, petId);
  if (!pet) throw new NotFoundError('Pet not found');
  return pet;
};

export const PetProfileService = {
  /** Full profile + active facts for a pet. */
  getProfile: async (userId: string, petId: string) => {
    await assertOwnership(userId, petId);
    const profile = await PetProfileModel.getProfile(petId);
    const facts = await PetProfileModel.listFacts(petId, { activeOnly: true });
    return { profile: profile ?? null, facts };
  },

  /** Patch structured profile fields directly. */
  updateProfile: async (userId: string, petId: string, patch: Record<string, unknown>) => {
    await assertOwnership(userId, petId);
    const allowed: Partial<PetProfileRow> = {};
    const strFields = ['dietBrand', 'dietType', 'dailyAmount', 'activityLevel', 'vaccinationStatus', 'groomingNotes', 'behaviorNotes'] as const;
    for (const f of strFields) {
      if (patch[f] !== undefined) (allowed as any)[f] = patch[f] == null ? null : String(patch[f]);
    }
    for (const f of ['allergies', 'healthConditions', 'medications'] as const) {
      if (patch[f] !== undefined && Array.isArray(patch[f])) {
        (allowed as any)[f] = (patch[f] as unknown[]).map((x) => String(x));
      }
    }
    return PetProfileModel.upsertProfile(petId, allowed);
  },

  /**
   * Save doctor-style profiling Q&A answers. Each answer becomes a structured
   * profile field (when its key maps to one) and a `profiling`-sourced fact so
   * the AI remembers the user's exact words.
   */
  saveProfilingAnswers: async (
    userId: string,
    petId: string,
    answers: { id?: string; question?: string; answer: unknown; category?: string }[],
  ) => {
    await assertOwnership(userId, petId);
    if (!Array.isArray(answers) || answers.length === 0) {
      return PetProfileService.getProfile(userId, petId);
    }

    // Map well-known question ids to structured profile fields.
    const FIELD_MAP: Record<string, keyof PetProfileRow> = {
      diet_brand: 'dietBrand',
      food_brand: 'dietBrand',
      brand: 'dietBrand',
      diet: 'dietType',
      diet_type: 'dietType',
      food: 'dietType',
      food_type: 'dietType',
      daily_amount: 'dailyAmount',
      amount: 'dailyAmount',
      activity: 'activityLevel',
      activity_level: 'activityLevel',
      vaccination: 'vaccinationStatus',
      vaccination_status: 'vaccinationStatus',
      vaccines: 'vaccinationStatus',
      grooming: 'groomingNotes',
      behavior: 'behaviorNotes',
      behaviour: 'behaviorNotes',
    };
    const ARRAY_MAP: Record<string, keyof PetProfileRow> = {
      allergies: 'allergies',
      allergy: 'allergies',
      health: 'healthConditions',
      health_conditions: 'healthConditions',
      conditions: 'healthConditions',
      medications: 'medications',
      medication: 'medications',
    };

    /**
     * Multi-select answers arrive either as a real array or (from older
     * clients) as a comma-joined string. Either way the profile column stores
     * one entry per value, and "no answer" markers are dropped so an empty
     * allergy list means exactly that.
     */
    const NON_ANSWERS = new Set(['none', 'not sure', 'no', 'n/a', 'nothing', 'unknown']);
    const toArray = (value: unknown, joined: string): string[] =>
      (Array.isArray(value) ? value.map((v) => String(v)) : joined.split(','))
        .map((v) => v.trim())
        .filter((v) => v !== '' && !NON_ANSWERS.has(v.toLowerCase()));

    const patch: Partial<PetProfileRow> = {};
    let freeformNote = '';
    for (const a of answers) {
      const key = (a.id ?? '').toLowerCase();
      const answerStr = Array.isArray(a.answer) ? a.answer.join(', ') : String(a.answer ?? '').trim();
      if (!answerStr) continue;

      // The closing open-ended question: capture verbatim, then decompose it
      // into individual facts below (the user may pack several details in).
      if (key === 'additional_info') {
        freeformNote = answerStr;
        await PetProfileModel.addFact({ petId, fact: answerStr, category: 'other', source: 'profiling' });
        continue;
      }

      if (ARRAY_MAP[key]) {
        (patch as any)[ARRAY_MAP[key]] = toArray(a.answer, answerStr);
      } else if (FIELD_MAP[key]) {
        (patch as any)[FIELD_MAP[key]] = answerStr;
      }

      // Always record the answer as a profiling fact. Onboarding saves answers
      // step by step, so a re-answer supersedes the earlier one for the same
      // question rather than piling up contradictions.
      const fact = await PetProfileModel.addFact({
        petId,
        fact: a.question ? `${a.question} — ${answerStr}` : answerStr,
        category: VALID_CATEGORIES.includes(a.category ?? '') ? a.category : 'other',
        source: 'profiling',
      });
      if (a.question) {
        await PetProfileModel.supersedePriorProfilingFacts(petId, a.question, fact.id);
      }
    }

    if (Object.keys(patch).length > 0) {
      await PetProfileModel.upsertProfile(petId, patch);
    }

    // Decompose the free-form note into individual durable facts (best-effort,
    // background — same extractor used for chat). Don't block the response.
    if (freeformNote) {
      void PetProfileService.extractFactsFromMessage({
        userId,
        petId,
        userText: freeformNote,
        assistantText: '',
      });
    }

    return PetProfileService.getProfile(userId, petId);
  },

  // ── Manual fact management ─────────────────────────────────────────────────
  listFacts: async (userId: string, petId: string) => {
    await assertOwnership(userId, petId);
    return PetProfileModel.listFacts(petId, { activeOnly: true });
  },

  addManualFact: async (userId: string, petId: string, fact: string, category?: string) => {
    await assertOwnership(userId, petId);
    if (!fact?.trim()) throw new NotFoundError('Fact text required');
    return PetProfileModel.addFact({
      petId,
      fact: fact.trim(),
      category: VALID_CATEGORIES.includes(category ?? '') ? category : 'other',
      source: 'manual',
    });
  },

  /** Fact saved by the AI via the save_pet_fact tool (ownership-checked, source 'chat'). */
  addAiFact: async (userId: string, petId: string, fact: string, category?: string, sessionId?: string) => {
    await assertOwnership(userId, petId);
    if (!fact?.trim()) throw new NotFoundError('Fact text required');
    return PetProfileModel.addFact({
      petId,
      fact: fact.trim(),
      category: VALID_CATEGORIES.includes(category ?? '') ? category : 'other',
      source: 'chat',
      sessionId: sessionId ?? null,
    });
  },

  deleteFact: async (userId: string, petId: string, factId: string) => {
    await assertOwnership(userId, petId);
    await PetProfileModel.deleteFact(petId, factId);
    return { deleted: true };
  },

  /**
   * Background memory enrichment: read a chat exchange and persist any new,
   * durable facts about the pet. Called fire-and-forget from the chat flow, so
   * it must never throw into the caller. Best-effort: silently no-ops on error.
   */
  extractFactsFromMessage: async (params: {
    userId: string;
    petId: string;
    sessionId?: string;
    userText: string;
    assistantText: string;
  }): Promise<void> => {
    const { userId, petId, sessionId, userText, assistantText } = params;
    try {
      // Only the Google path is used here (default/fallback provider).
      const resolved = await getModelForPurpose('general_chat');
      if (resolved.provider !== 'google' || !resolved.apiKey) return;

      const existing = await PetProfileModel.listFacts(petId, { activeOnly: true, limit: 25 });
      const existingList = existing.map((f) => `- ${f.fact}`).join('\n') || '(none)';

      const prompt = `You extract durable facts about a pet from a chat exchange, to build long-term memory.

Already-known facts (do NOT repeat these or trivial rephrasings):
${existingList}

Chat exchange:
User: ${userText}
Assistant: ${assistantText}

Extract ONLY new, durable facts about the pet (diet, health, allergies, activity, behavior, preferences). Ignore greetings, questions, scheduling chatter, and anything not a lasting fact about the pet. If there is nothing new, return an empty array.

Return ONLY a JSON array, no markdown:
[{"category":"diet|health|activity|behavior|preference|other","fact":"concise statement"}]`;

      const genAI = new GoogleGenerativeAI(resolved.apiKey);
      const model = genAI.getGenerativeModel({ model: resolved.modelName });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const usage = result.response.usageMetadata;

      await recordTokenUsage({
        userId,
        petId,
        sessionId,
        model: resolved,
        feature: 'fact_extraction',
        inputTokens: usage?.promptTokenCount ?? 200,
        outputTokens: usage?.candidatesTokenCount ?? 100,
      });

      const facts = parseJson(text);
      if (!Array.isArray(facts)) return;
      for (const f of facts) {
        const factText = String(f?.fact ?? '').trim();
        if (!factText) continue;
        await PetProfileModel.addFact({
          petId,
          fact: factText,
          category: VALID_CATEGORIES.includes(f?.category) ? f.category : 'other',
          source: 'chat',
          sessionId: sessionId ?? null,
        });
      }
    } catch (e: any) {
      console.warn('[extractFactsFromMessage] failed:', e?.message ?? e);
    }
  },
};
