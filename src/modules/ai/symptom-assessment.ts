import { getModelForPurpose, recordTokenUsage } from './model-registry';
import { generateText, generateGroundedText } from './generate';
import { PetProfileModel } from '@/modules/pet-profile/model';
import { VaccinationsModel } from '@/modules/vaccinations/model';
import { db } from '@/shared/db';
import { and, desc, eq, gte, isNull } from 'drizzle-orm';
import { medicalRecords, pets, symptomReports } from '@/shared/db/schema';

export type SymptomAssessment = {
  urgency: 'low' | 'medium' | 'high' | 'emergency';
  concern: string;
  shouldSeeVet: boolean;
  advice: string;
  disclaimer: string;
  /** Why this breed/age/history matters here, when it does. */
  breedNote?: string;
  /** Short prose from the web-grounded research pass, when one ran. */
  research?: string;
  /** Pages the research was grounded in. */
  sources?: { title: string; uri: string }[];
  /** Row id in `symptom_reports` — the handle for history and "ask CareLeo". */
  reportId?: string;
};

/** One generated follow-up question and what the owner answered. */
export type SymptomAnswer = { question: string; answer: string };

const DISCLAIMER = 'This is AI guidance, not a veterinary diagnosis. For anything serious or worsening, consult a licensed vet.';

/**
 * How long to wait before asking how the pet is doing.
 *
 * The triage itself was always the easy half. The half that changes outcomes is
 * coming back two days later and asking whether the limp got better — which is
 * only possible because the assessment is now written down.
 */
const FOLLOW_UP_HOURS: Record<SymptomAssessment['urgency'], number> = {
  emergency: 6,
  high: 12,
  medium: 48,
  low: 96,
};

/**
 * Best-effort persistence; triage must still work if the write fails.
 *
 * Returns the new row id so the caller can hand it to the app — the history
 * screen and "Ask CareLeo about this" both address a report by id.
 */
const recordAssessment = async (
  userId: string,
  petId: string | undefined,
  symptomText: string,
  assessment: SymptomAssessment,
  extra: { observations?: string[]; answers?: SymptomAnswer[]; source?: string } = {},
): Promise<string | undefined> => {
  try {
    const rows = await db
      .insert(symptomReports)
      .values({
        userId,
        petId: petId ?? null,
        symptoms: symptomText,
        urgency: assessment.urgency,
        concern: assessment.concern,
        advice: assessment.advice,
        shouldSeeVet: assessment.shouldSeeVet,
        observationsJson: extra.observations?.length ? JSON.stringify(extra.observations) : null,
        answersJson: extra.answers?.length ? JSON.stringify(extra.answers) : null,
        breedNote: assessment.breedNote ?? null,
        research: assessment.research ?? null,
        sourcesJson: assessment.sources?.length ? JSON.stringify(assessment.sources) : null,
        source: extra.source ?? 'ai',
        followUpAt: new Date(Date.now() + FOLLOW_UP_HOURS[assessment.urgency] * 60 * 60 * 1000),
      })
      .returning({ id: symptomReports.id });
    return rows[0]?.id;
  } catch (e: any) {
    console.warn('[assessSymptoms] could not record report:', e?.message ?? e);
    return undefined;
  }
};

/**
 * Bound a model call. The question step is an enrichment on a screen the owner
 * is waiting on, so a provider having a slow minute must degrade to the generic
 * questions in seconds rather than hold the flow open indefinitely.
 */
const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)),
  ]);

const parseJson = (text: string): any => {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch { return null; } }
    return null;
  }
};

type PetDossier = {
  /** Human-readable block fed to the model. */
  text: string;
  species: string;
  breed: string;
};

const ageFromDob = (dob?: string | null): string => {
  if (!dob) return '';
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return '';
  const months = Math.floor((Date.now() - born.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  if (months < 1) return 'under 1 month';
  if (months < 24) return `${months} months`;
  return `${Math.floor(months / 12)} years`;
};

/**
 * Everything the database already knows about this pet, as prose.
 *
 * Triage used to see three profile arrays and ten facts. The species, the
 * breed, the age and the medical history were all sitting in the same database
 * unused — and breed is exactly what changes the answer: laboured breathing in
 * a Bulldog and in a Beagle are not the same question.
 */
const buildDossier = async (petId?: string): Promise<PetDossier> => {
  const empty: PetDossier = { text: '', species: 'pet', breed: '' };
  if (!petId) return empty;

  try {
    const [pet] = await db.select().from(pets).where(eq(pets.id, petId)).limit(1);
    if (!pet) return empty;

    const bits: string[] = [];
    const species = pet.type || 'pet';
    const breed = pet.breed || '';

    const identity = [
      `Species: ${species}`,
      breed ? `Breed: ${breed}` : null,
      pet.gender ? `Sex: ${pet.gender}` : null,
      ageFromDob(pet.dob) ? `Age: ${ageFromDob(pet.dob)}` : null,
      pet.weight ? `Weight: ${pet.weight} kg` : null,
    ].filter(Boolean);
    bits.push(identity.join(' | '));

    const [profile, facts, records, vaccines] = await Promise.all([
      PetProfileModel.getProfile(petId).catch(() => undefined),
      PetProfileModel.listFacts(petId, { activeOnly: true, limit: 15 }).catch(() => []),
      db
        .select()
        .from(medicalRecords)
        .where(eq(medicalRecords.petId, petId))
        .orderBy(desc(medicalRecords.date))
        .limit(5)
        .catch(() => []),
      VaccinationsModel.listForPet(petId).catch(() => []),
    ]);

    if (profile?.healthConditions?.length) bits.push(`Ongoing conditions: ${profile.healthConditions.join(', ')}`);
    if (profile?.allergies?.length) bits.push(`Known allergies: ${profile.allergies.join(', ')}`);
    if (profile?.medications?.length) bits.push(`Current medications: ${profile.medications.join(', ')}`);
    if (profile?.dietType || profile?.dietBrand) {
      bits.push(`Diet: ${[profile.dietBrand, profile.dietType, profile.dailyAmount].filter(Boolean).join(', ')}`);
    }
    if (profile?.activityLevel) bits.push(`Activity level: ${profile.activityLevel}`);
    if (profile?.vaccinationStatus) bits.push(`Vaccination status: ${profile.vaccinationStatus}`);

    if (vaccines.length) {
      const summary = vaccines
        .slice(0, 8)
        .map((v) => `${v.vaccineName} (${v.status}${v.dueAt ? `, due ${v.dueAt}` : ''})`)
        .join('; ');
      bits.push(`Vaccinations on file: ${summary}`);
    }

    if (records.length) {
      const summary = records
        .map((r) => `${r.date}: ${r.title}${r.description ? ` — ${r.description.slice(0, 120)}` : ''}`)
        .join('; ');
      bits.push(`Recent medical history: ${summary}`);
    }

    if (facts.length) bits.push(`Other known facts: ${facts.map((f) => f.fact).join('; ')}`);

    return { text: `\nWhat we know about this pet:\n${bits.join('\n')}`, species, breed };
  } catch {
    return empty; // context is best-effort — triage must still run without it
  }
};

/**
 * Web-grounded research pass.
 *
 * Runs before the structured call because Gemini cannot ground a search and
 * emit strict JSON in the same request. Returns null when the provider has no
 * grounding (everything but Gemini) or the search fails, and the assessment
 * then proceeds exactly as it did before — the research is an enrichment, never
 * a dependency.
 */
const researchSymptoms = async (
  resolved: Awaited<ReturnType<typeof getModelForPurpose>>,
  symptomText: string,
  dossier: PetDossier,
): Promise<{ text: string; sources: { title: string; uri: string }[]; inputTokens: number; outputTokens: number } | null> => {
  const subject = [dossier.breed, dossier.species].filter(Boolean).join(' ') || 'pet';
  const prompt = `Search current veterinary sources for what these symptoms commonly indicate in a ${subject}.

Symptoms: ${symptomText}

Write at most 4 sentences covering:
- the common causes veterinary sources associate with this combination in this species/breed
- anything specific to this breed that owners are advised to watch for
- the warning signs those sources say warrant urgent care

Prefer veterinary schools, veterinary associations and established veterinary references. Do not diagnose this individual animal — summarise what the sources say. Plain prose, no headings, no lists.`;

  try {
    // Only Gemini grounds a live search. `general_chat` is frequently pointed at
    // DeepSeek or OpenAI, so fall back to whatever model the `vision` purpose
    // resolves to — it is the one purpose that has to be Google-capable — rather
    // than silently dropping web research whenever the chat model is not Gemini.
    let searchModel = resolved;
    if (searchModel.provider !== 'google') {
      const visionModel = await getModelForPurpose('vision').catch(() => null);
      if (visionModel?.provider === 'google' && visionModel.apiKey) searchModel = visionModel;
      else return null;
    }

    const grounded = await generateGroundedText(searchModel, prompt, 900);
    if (!grounded?.text?.trim()) return null;
    return {
      text: grounded.text.trim(),
      sources: grounded.sources,
      inputTokens: grounded.inputTokens,
      outputTokens: grounded.outputTokens,
    };
  } catch (e: any) {
    console.warn('[assessSymptoms] research pass failed:', e?.message ?? e);
    return null;
  }
};

/**
 * Dedicated AI symptom assessment.
 *
 * Three inputs feed one structured triage: everything the database holds about
 * the pet (species, breed, age, conditions, medications, vaccinations, recent
 * medical history), what the vision model could see in an attached photo, and a
 * web-grounded research pass over the symptoms for that breed. Returns advice —
 * explicitly NOT a diagnosis. Safe fallback on any failure.
 */
export async function assessSymptoms(
  userId: string,
  petId: string | undefined,
  symptoms: string[],
  observations: string[] = [],
  answers: SymptomAnswer[] = [],
  source: 'ai' | 'critical-sign' | 'offline' = 'ai',
): Promise<SymptomAssessment> {
  const symptomText = (symptoms ?? []).filter(Boolean).join(', ') || 'unspecified symptoms';
  const fallback: SymptomAssessment = {
    urgency: 'medium',
    concern: 'Unable to assess automatically',
    shouldSeeVet: true,
    advice: `I could not fully assess "${symptomText}". To be safe, consider checking with a vet.`,
    disclaimer: DISCLAIMER,
  };

  try {
    const resolved = await getModelForPurpose('general_chat');
    // Was `provider !== 'google'` — on any other provider every pet owner got
    // the "unable to assess" fallback with no indication triage was off.
    if (!resolved.apiKey) {
      const reportId = await recordAssessment(userId, petId, symptomText, fallback, { observations, answers, source });
      return { ...fallback, reportId };
    }

    const dossier = await buildDossier(petId);
    const research = await researchSymptoms(resolved, symptomText, dossier);

    const photoBlock = observations.length
      ? `\nVisible in the owner's photo (described by a vision model, not a diagnosis):\n- ${observations.join('\n- ')}`
      : '';
    const researchBlock = research
      ? `\nWhat current veterinary sources say about these symptoms in this species/breed:\n${research.text}`
      : '';

    const prompt = `You are a veterinary triage assistant. Assess these pet symptoms and respond with STRICT JSON only.

Symptoms: ${symptomText}${dossier.text}${photoBlock}${researchBlock}

Return:
{
  "urgency": "low" | "medium" | "high" | "emergency",
  "concern": "short possible concern (not a definitive diagnosis)",
  "shouldSeeVet": true | false,
  "advice": "2-3 sentences of practical guidance, referring to this pet's own history where it matters",
  "breedNote": "one sentence on why this pet's breed, age or history changes the picture, or \"\" if it does not"
}

Weigh the pet's own record: an existing condition, a current medication, an overdue vaccination or a matching past episode should change your answer. Be cautious: if symptoms could indicate something serious, lean toward higher urgency and shouldSeeVet=true. JSON only.`;

    const { text, inputTokens, outputTokens } = await generateText(resolved, prompt, 1024);
    await recordTokenUsage({
      userId, petId, model: resolved, feature: 'symptom_assessment',
      inputTokens: inputTokens + (research?.inputTokens ?? 0),
      outputTokens: outputTokens + (research?.outputTokens ?? 0),
    });

    const parsed = parseJson(text);
    if (!parsed || typeof parsed !== 'object') {
      const reportId = await recordAssessment(userId, petId, symptomText, fallback, { observations, answers, source });
      return { ...fallback, reportId };
    }
    const urgency = ['low', 'medium', 'high', 'emergency'].includes(parsed.urgency) ? parsed.urgency : 'medium';
    const breedNote = String(parsed.breedNote ?? '').trim();
    const assessment: SymptomAssessment = {
      urgency,
      concern: String(parsed.concern ?? fallback.concern),
      shouldSeeVet: parsed.shouldSeeVet ?? urgency !== 'low',
      advice: String(parsed.advice ?? fallback.advice),
      disclaimer: DISCLAIMER,
      ...(breedNote && { breedNote }),
      ...(research && { research: research.text, sources: research.sources }),
    };

    const reportId = await recordAssessment(userId, petId, symptomText, assessment, { observations, answers, source });
    return { ...assessment, reportId };
  } catch (e: any) {
    console.warn('[assessSymptoms] failed, using fallback:', e?.message ?? e);
    const reportId = await recordAssessment(userId, petId, symptomText, fallback, { observations, answers, source });
    return { ...fallback, reportId };
  }
}

// ─── Follow-up questions ────────────────────────────────────────────────────

export type SymptomQuestion = {
  id: string;
  question: string;
  type: 'single' | 'text';
  /** Tap targets for a 'single' question. Absent for free text. */
  options?: string[];
};

/**
 * Generic follow-ups, used when the model is unavailable or answers badly.
 * Deliberately short: a wrong-but-plausible question wastes the owner's time,
 * and severity and duration are already asked on their own screen.
 */
/**
 * Measured latency for this generation is 5–12s and swings with how much the
 * model decides to write, so a tight bound turned every slow-but-fine run into
 * a fallback. One attempt gets the full window; a second only runs if the first
 * failed early enough to leave room, capping the whole call at ~25s. The app
 * kicks this off while the owner answers severity and duration, so the wait is
 * mostly hidden either way.
 */
const QUESTION_TIMEOUT_MS = 20_000;
const QUESTION_BUDGET_MS = 25_000;

const FALLBACK_QUESTIONS: SymptomQuestion[] = [
  {
    id: 'q_progression',
    question: 'Has it been getting worse, staying the same, or improving?',
    type: 'single',
    options: ['Getting worse', 'About the same', 'Improving'],
  },
  {
    id: 'q_eating',
    question: 'Is your pet eating and drinking normally?',
    type: 'single',
    options: ['Yes, normally', 'Eating less', 'Not eating at all', 'Drinking much more'],
  },
  {
    id: 'q_other',
    question: 'Anything else you have noticed?',
    type: 'text',
  },
];

/**
 * Follow-up questions targeted at what was actually reported.
 *
 * The symptom checker asks severity and duration from a fixed list — those are
 * worth asking about anything. Everything past that depends on the case: a
 * limp and a cough need different second questions, and a photo showing a
 * weeping ear needs different ones again. This generates that middle set from
 * the symptoms, the photo observations and the pet's own record.
 */
export async function generateSymptomQuestions(
  userId: string,
  petId: string | undefined,
  symptoms: string[],
  observations: string[] = [],
): Promise<{ questions: SymptomQuestion[] }> {
  const symptomText = (symptoms ?? []).filter(Boolean).join(', ');
  if (!symptomText) return { questions: FALLBACK_QUESTIONS };

  try {
    const resolved = await getModelForPurpose('general_chat');
    if (!resolved.apiKey) return { questions: FALLBACK_QUESTIONS };

    const dossier = await buildDossier(petId);
    const photoBlock = observations.length
      ? `\nVisible in the owner's photo:\n- ${observations.join('\n- ')}`
      : '';

    // Terse on purpose. The first version spelled the rules out over eight
    // lines and the model answered with 1200 tokens of reasoning, taking 12-25s
    // and often overrunning; the same request stated compactly comes back in
    // ~6s and parses every time.
    const prompt = `Veterinary triage. Reported symptoms: ${symptomText}${dossier.text}${photoBlock}

Write exactly 3 or 4 follow-up questions that would most change the urgency of THIS case. STRICT JSON only:
{"questions":[{"id":"snake_id","question":"...","type":"single","options":["...","..."]}]}

Rules: specific to these symptoms in this species/breed; never generic illness questions; no severity or duration (asked elsewhere); use the pet's own record where relevant; "single" with 2-4 options, at most one "text" and it goes last; question under 20 words, option under 6 words; plain language for a worried owner. JSON only.`;

    let raw: any[] = [];
    const startedAt = Date.now();
    for (let attempt = 0; attempt < 2 && raw.length === 0; attempt++) {
      const remaining = QUESTION_BUDGET_MS - (Date.now() - startedAt);
      if (remaining < 3_000) break;
      try {
        const { text, inputTokens, outputTokens } = await withTimeout(
          generateText(resolved, prompt, 1200),
          Math.min(QUESTION_TIMEOUT_MS, remaining),
        );
        await recordTokenUsage({
          userId, petId, model: resolved, feature: 'symptom_questions',
          inputTokens, outputTokens,
        });
        const parsed = parseJson(text);
        if (Array.isArray(parsed?.questions)) raw = parsed.questions;
      } catch (e: any) {
        console.warn(`[generateSymptomQuestions] attempt ${attempt + 1} failed:`, e?.message ?? e);
      }
    }

    const questions: SymptomQuestion[] = raw
      .map((q: any, i: number): SymptomQuestion | null => {
        const question = String(q?.question ?? '').trim();
        if (!question) return null;
        const options = Array.isArray(q?.options)
          ? q.options.map((o: unknown) => String(o).trim()).filter(Boolean).slice(0, 4)
          : [];
        const type: SymptomQuestion['type'] = q?.type === 'text' || options.length < 2 ? 'text' : 'single';
        return {
          id: String(q?.id ?? `q_${i}`).trim() || `q_${i}`,
          question,
          type,
          ...(type === 'single' && { options }),
        };
      })
      .filter((q: SymptomQuestion | null): q is SymptomQuestion => q !== null)
      .slice(0, 4);

    return { questions: questions.length ? questions : FALLBACK_QUESTIONS };
  } catch (e: any) {
    console.warn('[generateSymptomQuestions] failed, using fallback:', e?.message ?? e);
    return { questions: FALLBACK_QUESTIONS };
  }
}

// ─── History ────────────────────────────────────────────────────────────────

export type StoredSymptomReport = {
  id: string;
  petId: string | null;
  petName: string | null;
  symptoms: string;
  urgency: SymptomAssessment['urgency'];
  concern: string | null;
  advice: string | null;
  shouldSeeVet: boolean;
  breedNote: string | null;
  research: string | null;
  observations: string[];
  answers: SymptomAnswer[];
  sources: { title: string; uri: string }[];
  source: string;
  chatSessionId: string | null;
  /** What the owner said when asked how the pet is doing since. */
  ownerUpdate: string | null;
  ownerUpdateAt: string | null;
  followUpAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

const parseJsonColumn = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
};

const toStoredReport = (row: any, petName: string | null = null): StoredSymptomReport => ({
  id: row.id,
  petId: row.petId ?? null,
  petName,
  symptoms: row.symptoms,
  urgency: row.urgency,
  concern: row.concern ?? null,
  advice: row.advice ?? null,
  shouldSeeVet: !!row.shouldSeeVet,
  breedNote: row.breedNote ?? null,
  research: row.research ?? null,
  observations: parseJsonColumn<string[]>(row.observationsJson, []),
  answers: parseJsonColumn<SymptomAnswer[]>(row.answersJson, []),
  sources: parseJsonColumn<{ title: string; uri: string }[]>(row.sourcesJson, []),
  source: row.source ?? 'ai',
  chatSessionId: row.chatSessionId ?? null,
  ownerUpdate: row.ownerUpdate ?? null,
  ownerUpdateAt: row.ownerUpdateAt ? new Date(row.ownerUpdateAt).toISOString() : null,
  followUpAt: row.followUpAt ? new Date(row.followUpAt).toISOString() : null,
  resolvedAt: row.resolvedAt ? new Date(row.resolvedAt).toISOString() : null,
  createdAt: new Date(row.createdAt).toISOString(),
});

/** Past assessments, newest first. Optionally narrowed to one pet. */
export async function listSymptomReports(
  userId: string,
  opts: { petId?: string; limit?: number } = {},
): Promise<{ reports: StoredSymptomReport[] }> {
  const conditions = [eq(symptomReports.userId, userId)];
  if (opts.petId) conditions.push(eq(symptomReports.petId, opts.petId));

  const rows = await db
    .select({ report: symptomReports, petName: pets.name })
    .from(symptomReports)
    .leftJoin(pets, eq(pets.id, symptomReports.petId))
    .where(and(...conditions))
    .orderBy(desc(symptomReports.createdAt))
    .limit(Math.min(opts.limit ?? 30, 100));

  return { reports: rows.map((r) => toStoredReport(r.report, r.petName ?? null)) };
}

/** One report, scoped to its owner. */
export async function getSymptomReport(userId: string, reportId: string): Promise<StoredSymptomReport | null> {
  const rows = await db
    .select({ report: symptomReports, petName: pets.name })
    .from(symptomReports)
    .leftJoin(pets, eq(pets.id, symptomReports.petId))
    .where(and(eq(symptomReports.id, reportId), eq(symptomReports.userId, userId)))
    .limit(1);

  const row = rows[0];
  return row ? toStoredReport(row.report, row.petName ?? null) : null;
}

/** Readable form of a stored report — used as the chat's opening message. */
export const formatReportForChat = (report: StoredSymptomReport): string => {
  const lines: string[] = [];
  const who = report.petName ?? 'this pet';

  lines.push(`**Symptom report for ${who}** · ${report.urgency.toUpperCase()} priority`);
  lines.push('');
  lines.push(`**Reported:** ${report.symptoms}`);
  if (report.observations.length) lines.push(`**Seen in the photo:** ${report.observations.join('; ')}`);
  if (report.answers.length) {
    lines.push('**Follow-up answers:**');
    for (const a of report.answers) lines.push(`- ${a.question} — ${a.answer}`);
  }
  lines.push('');
  if (report.concern) lines.push(`**Possible concern:** ${report.concern}`);
  if (report.advice) lines.push(report.advice);
  if (report.breedNote) lines.push(`**Breed/history note:** ${report.breedNote}`);
  if (report.shouldSeeVet) lines.push('A vet visit was advised.');
  lines.push('');
  lines.push('Ask me anything about this — what to watch for, whether to book a vet, or what to do tonight.');

  return lines.join('\n');
};

// ─── Chat integration ───────────────────────────────────────────────────────

/**
 * Open symptom episodes for a pet, as a block for the chat system prompt.
 *
 * Without this a general chat had no idea the pet was assessed two days ago:
 * the owner would say "he's still not eating" and the assistant would start
 * from nothing. Only unresolved reports from the last 30 days are included, and
 * at most three — the point is what is still going on, not a medical archive.
 * `get_symptom_history` covers the archive when the owner asks for it.
 */
export async function buildOpenSymptomBlock(petId?: string): Promise<string> {
  if (!petId) return '';

  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select()
      .from(symptomReports)
      .where(
        and(
          eq(symptomReports.petId, petId),
          isNull(symptomReports.resolvedAt),
          gte(symptomReports.createdAt, cutoff),
        ),
      )
      .orderBy(desc(symptomReports.createdAt))
      .limit(3);

    if (!rows.length) return '';

    const lines = rows.map((row) => {
      const days = Math.max(0, Math.round((Date.now() - new Date(row.createdAt).getTime()) / 86_400_000));
      const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
      const parts = [
        `- ${when} (report ${row.id}): "${row.symptoms}" — assessed ${row.urgency}${row.shouldSeeVet ? ', vet visit advised' : ''}.`,
      ];
      if (row.concern) parts.push(`  Possible concern: ${row.concern}`);
      if (row.ownerUpdate) parts.push(`  Owner's last update: ${row.ownerUpdate}`);
      else parts.push('  The owner has not said how it is going since.');
      return parts.join('\n');
    });

    return `\n\n[OPEN SYMPTOM EPISODES FOR THIS PET]\n${lines.join('\n')}\nIf the owner mentions how the pet is doing, record it with update_symptom_report — and mark it resolved when they say it cleared up. If an episode is still open and relevant, it is worth asking how the pet is now.\n[END OPEN SYMPTOM EPISODES]`;
  } catch {
    return ''; // context is best-effort
  }
}

/**
 * Record what the owner said when asked how the pet is doing, and close the
 * episode when they say it cleared up.
 */
export async function recordOwnerUpdate(
  userId: string,
  reportId: string,
  update: string,
  resolved = false,
): Promise<{ ok: boolean; resolved: boolean }> {
  const rows = await db
    .update(symptomReports)
    .set({
      ownerUpdate: update.slice(0, 1000),
      ownerUpdateAt: new Date(),
      ...(resolved && { resolvedAt: new Date() }),
    })
    .where(and(eq(symptomReports.id, reportId), eq(symptomReports.userId, userId)))
    .returning({ id: symptomReports.id });

  return { ok: rows.length > 0, resolved };
}
