import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { AiModel } from './model';
import { analyzePetImage, observeSymptomsInImage, type PetVisionResult, type SymptomVisionResult } from './vision';
import { CarePlanService, type CarePlan } from './care-plan';
import { AI_TOOL_DECLARATIONS, executeTool } from './tools';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { eq } from 'drizzle-orm';
import { db } from '@/shared/db';
import { aiChatSessions, symptomReports } from '@/shared/db/schema';
import { buildOpenSymptomBlock, formatReportForChat, getSymptomReport } from './symptom-assessment';
import { PetProfileModel } from '@/modules/pet-profile/model';
import { PetProfileService } from '@/modules/pet-profile/service';
import {
  getEssentialQuestions,
  getDeferredQuestions,
  getCoreQuestionIds,
  type ProfilingQuestion,
} from './profiling-questions';
import {
  getModelForPurpose,
  checkUserTokenLimit,
  recordTokenUsage,
  type AiPurpose,
  type ResolvedModel,
} from './model-registry';
import { generateText, parseJsonResponse } from './generate';
import { CURRENCY_CODE, CURRENCY_SYMBOL } from '@/shared/types/currency';
import { getPreferenceContext } from '@/modules/notifications/preferences';
import { describeNowInZone } from '@/shared/types/timezone';
import { streamChatTurn, type ChatImage, type ChatStreamEvent } from './stream';

// ─── Provider-specific chat clients ──────────────────────────────────────────

/** Returns a Gemini chat model (Google provider) */
function buildGeminiChatModel(resolved: ResolvedModel, withTools = false) {
  const genAI = new GoogleGenerativeAI(resolved.apiKey);
  return genAI.getGenerativeModel({
    model: resolved.modelName,
    ...(withTools && {
      tools: [{ functionDeclarations: AI_TOOL_DECLARATIONS as any }],
    }),
  });
}

/**
 * Returns an OpenAI-compatible client.
 * Works for: openai, deepseek, ollama, any OpenAI-compatible endpoint.
 */
function buildOpenAIClient(resolved: ResolvedModel): OpenAI {
  const resolvedBaseUrl = resolved.baseUrl
    ? resolved.baseUrl
    : resolved.provider === 'deepseek' ? 'https://api.deepseek.com' : undefined;
  return new OpenAI({
    apiKey: resolved.apiKey,
    baseURL: resolvedBaseUrl,
  });
}

/**
 * Returns an Anthropic-compatible client.
 * Works for: anthropic, and any Anthropic-compatible proxy endpoint.
 */
function buildAnthropicClient(resolved: ResolvedModel): Anthropic {
  return new Anthropic({
    apiKey: resolved.apiKey,
    ...(resolved.baseUrl && { baseURL: resolved.baseUrl }),
  });
}

const parseJson = parseJsonResponse;

/** Bengali script range — enough to tell which language to fail in. */
const BENGALI = /[ঀ-৿]/;

/**
 * Fallback copy in the language the user is actually writing in.
 *
 * These strings used to be hardcoded Bengali, which is wrong for the English
 * half of the audience — a failure arrived in a script they may not read.
 */
const fallbackCopy = (userText: string) => {
  const bn = BENGALI.test(userText);
  return {
    failed: bn
      ? 'আমি তোমাকে সাহায্য করতে পারলাম না। আবার চেষ্টা করো।'
      : "I couldn't complete that. Please try again.",
    didActions: bn
      ? 'কাজগুলো করে ফেলেছি, তবে গুছিয়ে বলতে পারলাম না। নিচে যা করেছি:'
      : "I finished the actions but couldn't summarise them. Here is what I did:",
  };
};

/**
 * Compact, provider-neutral record of the actions an earlier turn took.
 *
 * Tool calls are persisted to `toolCallsJson` but only message text was ever
 * rebuilt into the next turn's history, so on a follow-up ("did you set that
 * reminder?") the model had no idea it had just acted. Replaying the raw
 * provider-specific tool blocks would mean three different formats; appending a
 * short note to the assistant's own message works for all of them.
 */
const withToolNote = (content: string, toolCallsJson?: string | null): string => {
  if (!toolCallsJson) return content;
  try {
    const calls = JSON.parse(toolCallsJson) as { tool: string; args?: Record<string, unknown> }[];
    if (!Array.isArray(calls) || calls.length === 0) return content;
    const summary = calls
      .map((c) => `${c.tool}(${Object.keys(c.args ?? {}).join(', ')})`)
      .join('; ');
    return `${content}\n\n[actions you already performed in this turn: ${summary}]`;
  } catch {
    return content;
  }
};

/**
 * Whether the chat model can accept an image alongside the text.
 *
 * Deliberately a name check rather than a provider check: `openai_custom` may
 * be a local Llava that sees, while plain `deepseek` does not. Erring towards
 * "no" is safe — the fallback path describes the image with the vision model
 * and the user still gets an answer.
 */
const VISION_CAPABLE = /gemini|gpt-4o|gpt-4\.1|gpt-5|o[34]|claude|llava|vision/i;

const modelSupportsVision = (resolved: ResolvedModel): boolean =>
  resolved.provider === 'google' || VISION_CAPABLE.test(resolved.modelName);

/** Turns kept verbatim; anything older is folded into the session summary. */
const CONTEXT_WINDOW = 20;
/** Summarise once this many messages sit outside the window. */
const SUMMARY_TRIGGER = 10;

/**
 * Fold older turns into a rolling summary so a long conversation keeps its
 * thread.
 *
 * Only the last `CONTEXT_WINDOW` messages were ever sent to the model, so a
 * conversation that ran past that quietly forgot how it started — the user
 * would be asked again for something they had already explained. This
 * compresses everything that has scrolled out and carries it forward.
 *
 * Best-effort: a failure here degrades memory, so it must never fail a reply.
 */
async function updateSessionSummary(
  session: { id: string; summary: string | null; summarizedUpTo: number },
  history: { role: string; content: string | null }[],
): Promise<string | null> {
  const outsideWindow = Math.max(0, history.length - CONTEXT_WINDOW);
  if (outsideWindow - session.summarizedUpTo < SUMMARY_TRIGGER) return session.summary;

  try {
    const unsummarized = history
      .slice(session.summarizedUpTo, outsideWindow)
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => `${m.role}: ${(m.content ?? '').slice(0, 600)}`)
      .join('\n');
    if (!unsummarized.trim()) return session.summary;

    const resolved = await getModelForPurpose('general_chat');
    if (!resolved.apiKey) return session.summary;

    const { text } = await generateText(
      resolved,
      `${session.summary ? `Summary so far:\n${session.summary}\n\n` : ''}New part of the conversation:\n${unsummarized}\n\nRewrite the summary so it covers everything above. Keep only what still matters later: decisions made, facts about the pet, things the user asked for or refused, and anything still outstanding. Drop pleasantries. Under 200 words, plain prose, no preamble.`,
      512,
    );

    const summary = text.trim();
    if (!summary) return session.summary;
    await AiModel.updateSessionSummary(session.id, summary, outsideWindow);
    return summary;
  } catch (e: any) {
    console.warn('[updateSessionSummary] failed:', e?.message ?? e);
    return session.summary;
  }
}

// ─── Onboarding question cache ───────────────────────────────────────────────
// Breed-specific questions are identical for every "3-year-old Beagle", so
// regenerating them per signup is pure latency + tokens. Keyed by species,
// breed and age bucket; process-local and short-lived by design.

const ONBOARDING_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ONBOARDING_CACHE_MAX = 200;
const onboardingQuestionCache = new Map<string, { questions: any[]; expiresAt: number }>();

/** Normalises "6 months" / "adult (1-5 years)" / "3" into a coarse life stage. */
function ageBucket(age?: string): string {
  const raw = (age ?? '').toLowerCase().trim();
  if (!raw) return 'unknown';
  if (raw.includes('senior') || raw.includes('old')) return 'senior';
  if (raw.includes('puppy') || raw.includes('kitten') || raw.includes('baby')) return 'baby';

  const num = parseFloat(raw.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(num)) {
    if (raw.includes('young')) return 'baby';
    if (raw.includes('adult')) return 'adult';
    return 'unknown';
  }
  const years = /week|day/.test(raw) ? num / 52 : /month|\bmo\b/.test(raw) ? num / 12 : num;
  if (years < 1) return 'baby';
  if (years < 3) return 'young';
  if (years < 8) return 'adult';
  return 'senior';
}

function readOnboardingCache(key: string): any[] | null {
  const hit = onboardingQuestionCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    onboardingQuestionCache.delete(key);
    return null;
  }
  return hit.questions;
}

function writeOnboardingCache(key: string, questions: any[]) {
  if (onboardingQuestionCache.size >= ONBOARDING_CACHE_MAX) {
    const oldest = onboardingQuestionCache.keys().next().value;
    if (oldest) onboardingQuestionCache.delete(oldest);
  }
  onboardingQuestionCache.set(key, { questions, expiresAt: Date.now() + ONBOARDING_CACHE_TTL_MS });
}

/** Diet brand already used by another pet of the same owner — a good default. */
async function findKnownDietBrand(userId: string, excludePetId?: string): Promise<string | null> {
  try {
    const pets = await AiModel.getUserPets(userId);
    for (const pet of pets.slice(0, 4)) {
      if (excludePetId && pet.id === excludePetId) continue;
      const profile = await PetProfileModel.getProfile(pet.id);
      if (profile?.dietBrand) return profile.dietBrand;
    }
  } catch {
    // Best-effort context only.
  }
  return null;
}

// ─── Context builder for chat system prompt ───────────────────────────────
/**
 * Append a session's stored context snapshot to the system prompt.
 *
 * Returns the prompt unchanged when there is no snapshot or it does not parse,
 * so a malformed row can never break a chat.
 */
function buildContextSnapshotBlock(snapshotJson: string | null | undefined, prompt: string): string {
  if (!snapshotJson) return prompt;
  try {
    const snapshot = JSON.parse(snapshotJson);
    if (snapshot?.kind !== 'symptom_report') return prompt;

    const lines = [
      `Pet: ${snapshot.petName ?? 'unknown'}`,
      `Assessed: ${snapshot.assessedAt ?? 'recently'}`,
      `Urgency: ${snapshot.urgency}`,
      `Reported symptoms: ${snapshot.symptoms}`,
      snapshot.concern ? `Possible concern: ${snapshot.concern}` : null,
      snapshot.advice ? `Advice given: ${snapshot.advice}` : null,
      snapshot.breedNote ? `Breed/history note: ${snapshot.breedNote}` : null,
      snapshot.observations?.length ? `Seen in the owner's photo: ${snapshot.observations.join('; ')}` : null,
      snapshot.answers?.length
        ? `Follow-up answers: ${snapshot.answers.map((a: any) => `${a.question} — ${a.answer}`).join(' | ')}`
        : null,
      snapshot.shouldSeeVet ? 'A vet visit was advised.' : null,
    ].filter(Boolean);

    return `${prompt}\n\n[THIS CHAT IS ABOUT A SYMPTOM ASSESSMENT]\n${lines.join('\n')}\nAnswer in the context of this episode. It is guidance, not a diagnosis.\n[END SYMPTOM ASSESSMENT]`;
  } catch {
    return prompt;
  }
}

export async function buildSystemPrompt(userId: string, petId?: string): Promise<string> {
  const allPets = await AiModel.getUserPets(userId);
  // The assistant schedules things, so it needs the clock the user is looking
  // at — not just the date, and not the server's zone. Without this it either
  // says it cannot tell the time or quietly invents one.
  const { timezone } = await getPreferenceContext(userId);
  const instructions = await AiModel.getActiveInstructions(userId, petId);

  let adminBlock = '';
  if (instructions.length > 0) {
    const lines = instructions.map((i) => `- ${i.instruction}`).join('\n');
    adminBlock = `\n\n[ADMIN INSTRUCTIONS — follow these carefully]\n${lines}\n[END ADMIN INSTRUCTIONS]`;
  }

  let petsBlock = '';
  if (allPets.length > 0) {
    const petLines = allPets.map((p) => {
      return `  • ${p.name} (${p.type}${p.breed ? ` — ${p.breed}` : ''}, ID: ${p.id})`;
    });
    petsBlock = `\nUser's pets:\n${petLines.join('\n')}`;
  }

  // Inject the active pet's structured profile + learned facts so the AI
  // answers with full memory of this specific pet.
  let memoryBlock = '';
  if (petId) {
    try {
      const profile = await PetProfileModel.getProfile(petId);
      const facts = await PetProfileModel.listFacts(petId, { activeOnly: true, limit: 15 });
      const parts: string[] = [];
      if (profile) {
        const fields: [string, unknown][] = [
          ['Diet brand', profile.dietBrand],
          ['Diet type', profile.dietType],
          ['Daily amount', profile.dailyAmount],
          ['Activity level', profile.activityLevel],
          ['Allergies', profile.allergies?.length ? profile.allergies.join(', ') : ''],
          ['Health conditions', profile.healthConditions?.length ? profile.healthConditions.join(', ') : ''],
          ['Medications', profile.medications?.length ? profile.medications.join(', ') : ''],
          ['Vaccination', profile.vaccinationStatus],
          ['Grooming', profile.groomingNotes],
          ['Behavior', profile.behaviorNotes],
        ];
        const filled = fields.filter(([, v]) => v != null && String(v).trim() !== '');
        if (filled.length) parts.push(filled.map(([k, v]) => `  - ${k}: ${v}`).join('\n'));
      }
      if (facts.length) {
        parts.push('  Known facts:\n' + facts.map((f) => `    • ${f.fact}`).join('\n'));
      }
      if (parts.length) {
        memoryBlock = `\n\n[PET MEMORY — what you already know about this pet; use it, don't re-ask]\n${parts.join('\n')}\n[END PET MEMORY]`;
      }
    } catch {
      // Memory is best-effort context; never block a reply on it.
    }
  }

  // Symptom episodes that are still open for this pet, so a chat that was not
  // started from a report still knows the pet was assessed recently and can
  // ask how it is going.
  const openSymptomBlock = await buildOpenSymptomBlock(petId);

  return `You are Careleo AI, a caring and knowledgeable pet care assistant.

Right now it is ${describeNowInZone(timezone)} where the user is (timezone: ${timezone}).
You DO know the current date and time — it is the line above. Use it for "today",
"tonight", "in 2 hours" and anything else relative, and never tell the user you
have no access to the time.

Scheduling times:
- When a tool takes a date-time (\`dueDate\`, \`reminderTime\`, \`appointmentAt\`), write it as
  the user's local wall-clock time in \`YYYY-MM-DDTHH:mm\` form (e.g. 2026-03-04T07:30).
  It is interpreted in ${timezone}, so never convert to UTC and never add a Z.
- A bare \`HH:mm\` is also accepted and means the next time that clock reads it.
- Confirm back in the user's own words ("tomorrow 7:30 AM"), not as a raw timestamp.
${adminBlock}
${petsBlock}${memoryBlock}${openSymptomBlock}

Your personality:
- Warm, friendly, like a knowledgeable friend — not a cold assistant
- Proactive: mention health concerns when relevant based on pet data
- Concise: helpful and direct, not overly long
- Language: respond in the same language the user writes in (Bengali or English)
- When you create tasks, set reminders, or take actions — always confirm what you did

You can help with: pet health questions, creating care schedules, food advice, product recommendations, vet appointments, and general pet wellbeing.

Health & vet handling:
- If the user describes their pet feeling unwell, use detect_symptoms to gauge urgency. It is guidance, not a diagnosis — always say so.
- If a vet visit is advised, use find_nearby_vets, then get_vet_availability, then book_vet_appointment (confirm details first).
- After a vet visit, capture what happened with save_medical_record, and set reminders for any medication or follow-up.
- Record vaccinations with add_vaccination (a due date sets a reminder).
- Any open symptom episodes for the active pet are listed in your context above. When one is open and the conversation gives you an opening, ask how the pet is doing now — by name, referring to what was actually reported.
- When the owner tells you how a pet is doing since an assessment ("he's eating again", "still limping", "worse today"), call update_symptom_report with their own words, and set resolved only when they say it has cleared up.
- Use get_symptom_history when the owner refers back to something earlier ("the limp again", "same as last time") or when you need an episode's id.

Money:
- Every amount on this platform is in ${CURRENCY_CODE} and is written ${CURRENCY_SYMBOL}. Tools return ready-made \`*_display\` strings — quote them as they are.
- Never convert to another currency, and never swap in a different symbol because of the language being spoken or where the user lives.`;
}

export const AiService = {
  async ping() {
    return { success: true, data: await AiModel.ping(), error: null };
  },

  // ─── Vision: Analyze pet image ─────────────────────────────────────────

  async analyzePetImage(
    userId: string,
    imageBase64: string,
    mimeType: string,
  ): Promise<PetVisionResult> {
    // Check user token limit
    const limitCheck = await checkUserTokenLimit(userId);
    if (!limitCheck.allowed) throw new ValidationError(limitCheck.reason ?? 'Token limit reached');

    const visionModel = await getModelForPurpose('vision');
    const result = await analyzePetImage(imageBase64, mimeType, visionModel);

    await recordTokenUsage({
      userId, model: visionModel, feature: 'vision',
      inputTokens: 1000, outputTokens: 200,
    });

    return result;
  },

  /**
   * Describe what a symptom photo shows. Feeds the symptom checker's optional
   * photo step; the observations become extra input to the text assessment
   * rather than an assessment of their own.
   */
  async observeSymptomImage(
    userId: string,
    imageBase64: string,
    mimeType: string,
  ): Promise<SymptomVisionResult> {
    const limitCheck = await checkUserTokenLimit(userId);
    if (!limitCheck.allowed) throw new ValidationError(limitCheck.reason ?? 'Token limit reached');

    const visionModel = await getModelForPurpose('vision');
    const result = await observeSymptomsInImage(imageBase64, mimeType, visionModel);

    await recordTokenUsage({
      userId, model: visionModel, feature: 'symptom_vision',
      inputTokens: 1000, outputTokens: 200,
    });

    return result;
  },

  // ─── Onboarding: Generate dynamic questions ────────────────────────────

  /**
   * Onboarding questions for a freshly added pet.
   *
   * Returns two lists: `questions` is what the app asks right now — the four
   * species-appropriate essentials plus at most ONE breed-specific question
   * from the AI — and `deferredQuestions` is everything else, for the profile
   * screen later. Keeping onboarding at five taps is deliberate; the old flow
   * asked 12–14 and users dropped out mid-way.
   */
  async generateOnboardingQuestions(
    userId: string,
    petType: string,
    breed: string,
    estimatedAge: string,
    weight?: string,
    extraContext?: { color?: string; size?: string; petId?: string },
  ) {
    const limitCheck = await checkUserTokenLimit(userId);
    if (!limitCheck.allowed) throw new ValidationError(limitCheck.reason ?? 'Token limit reached');

    const essential = getEssentialQuestions(petType);
    const deferred = getDeferredQuestions(petType);
    const knownIds = getCoreQuestionIds(petType);

    // Breed questions are the same for every "3-year-old Beagle" — reuse them.
    const cacheKey = `${(petType || 'unknown').toLowerCase()}|${(breed || 'unknown').toLowerCase()}|${ageBucket(estimatedAge)}`;
    let extras = readOnboardingCache(cacheKey);

    if (!extras) {
      const knownBrand = await findKnownDietBrand(userId, extraContext?.petId);
      const prompt = `You are a veterinary expert designing a mobile onboarding form for a new pet owner.

Pet details:
- Species: ${petType}
- Breed: ${breed || 'Unknown'}
- Age: ${estimatedAge || 'Unknown'}
- Weight: ${weight || 'Unknown'}
- Coat/colour: ${extraContext?.color || 'Unknown'}
- Size: ${extraContext?.size || 'Unknown'}
${knownBrand ? `- The owner already feeds another pet "${knownBrand}" — you may use it as a likely option.\n` : ''}
Generate 3-5 questions that are:
1. Highly SPECIFIC to this species, breed, age stage and size — breed-typical health risks, age-stage needs, size-appropriate care. A generic question that would suit any pet is a failure.
2. NOT about anything already asked. These ids are already covered, do not repeat them or ask the same thing under a different name: ${knownIds.join(', ')}.
3. Fast to answer on a phone: prefer "single_choice" or "multi_select" with 3-5 short options. AT MOST ONE question may be free "text", and only if choices genuinely cannot capture it.
4. Ordered easiest first; anything sensitive (illness, cost, past trauma) last.
5. Friendly and plain — no jargon.

Each question also gets an "importance" from 1-5: how much a vet would want this answered on day one. Exactly one question should be a 5.

Return a JSON array with this exact structure:
[
  {
    "id": "unique_snake_case_key",
    "title": "Short section title (1-2 words)",
    "question": "The question text",
    "type": "single_choice" | "multi_select" | "numeric" | "text",
    "unit": "kg" or "cups" etc (only for numeric type),
    "options": ["Option 1", "Option 2"] (required for choice types, 3-5 items),
    "required": true | false,
    "importance": 1-5,
    "category": "diet" | "health" | "activity" | "behavior" | "preference" | "other",
    "tip": "Optional one-line tip specific to this breed"
  }
]

Return ONLY the valid JSON array. No markdown, no extra text.`;

      // If the AI call fails (quota, network, bad JSON) onboarding still works:
      // the species core set is always returned.
      try {
        const resolved = await getModelForPurpose('onboarding');
        const { text, inputTokens, outputTokens } = await generateText(resolved, prompt);

        await recordTokenUsage({
          userId,
          model: resolved,
          feature: 'onboarding',
          inputTokens,
          outputTokens,
        });

        const aiQuestions = parseJson(text);
        extras = Array.isArray(aiQuestions)
          ? aiQuestions
              .filter((q: any) => q?.id && q?.question && !knownIds.includes(q.id))
              .map((q: any) => ({
                ...q,
                // Choice questions without options would render as an empty list.
                type: (q.type === 'single_choice' || q.type === 'multi_select') && !q.options?.length ? 'text' : q.type,
                required: q.required !== false,
                category: q.category ?? 'other',
              }))
              .sort((a: any, b: any) => (b.importance ?? 0) - (a.importance ?? 0))
          : [];
        writeOnboardingCache(cacheKey, extras);
      } catch (e: any) {
        console.warn('[generateOnboardingQuestions] AI generation failed, using core only:', e?.message ?? e);
        extras = [];
      }
    }

    // The single most useful AI question joins onboarding; the rest wait.
    const [topExtra, ...restExtras] = extras;
    const questions: ProfilingQuestion[] = [
      ...essential,
      ...(topExtra ? [{ ...topExtra, stage: 'essential' as const, required: false }] : []),
    ];
    const deferredQuestions = [
      ...deferred,
      ...restExtras.map((q: any) => ({ ...q, stage: 'deferred' as const })),
    ];

    return { questions, deferredQuestions, aiGenerated: extras.length > 0 };
  },

  // ─── Onboarding: closing insights ─────────────────────────────────────

  /**
   * Three short, specific insights shown at the end of onboarding, so the
   * questions the owner just answered visibly pay off. Never throws — falls
   * back to profile-derived lines when the model is unavailable.
   */
  async generateOnboardingInsights(userId: string, petId: string) {
    const pets = await AiModel.getUserPets(userId);
    const pet = pets.find((p) => p.id === petId);
    if (!pet) throw new ValidationError('Pet not found');

    const profile = await PetProfileModel.getProfile(petId);
    const facts = await PetProfileModel.listFacts(petId, { activeOnly: true, limit: 15 });

    const fallback = [
      `I’ll keep track of ${pet.name}’s routine and remind you before anything is due.`,
      profile?.vaccinationStatus && profile.vaccinationStatus !== 'Up to date'
        ? `${pet.name}’s vaccinations need attention — ask me to find a vet nearby any time.`
        : `Ask me anything about ${pet.name}’s food, behaviour or health — I already know the basics.`,
      `Tell me when something changes and I’ll remember it for next time.`,
    ];

    try {
      const known = [
        profile?.dietType ? `Diet: ${profile.dietType}` : '',
        profile?.dietBrand ? `Brand: ${profile.dietBrand}` : '',
        profile?.activityLevel ? `Activity: ${profile.activityLevel}` : '',
        profile?.allergies?.length ? `Allergies: ${profile.allergies.join(', ')}` : '',
        profile?.healthConditions?.length ? `Conditions: ${profile.healthConditions.join(', ')}` : '',
        profile?.vaccinationStatus ? `Vaccination: ${profile.vaccinationStatus}` : '',
        ...facts.map((f) => `- ${f.fact}`),
      ]
        .filter(Boolean)
        .join('\n');

      const prompt = `You are a veterinarian writing the first thing a new CareLeo user reads about their pet.

Pet: ${pet.name}, a ${pet.type}${pet.breed ? ` (${pet.breed})` : ''}${pet.dob ? `, born ${pet.dob}` : ''}.
What the owner just told us:
${known || '(nothing beyond the basics)'}

Write exactly 3 insights, each one sentence, each SPECIFIC to this pet's breed, age or what the owner said — no generic pet advice. At least one must be something actionable CareLeo will help with (a reminder, a check, a booking). Warm and plain, no jargon, no emoji at the start.

Return ONLY a JSON array of 3 strings.`;

      const resolved = await getModelForPurpose('onboarding');
      const { text, inputTokens, outputTokens } = await generateText(resolved, prompt, 512);
      await recordTokenUsage({
        userId,
        petId,
        model: resolved,
        feature: 'onboarding_insights',
        inputTokens,
        outputTokens,
      });

      const parsed = parseJson(text);
      const insights = Array.isArray(parsed)
        ? parsed.map((i) => String(i).trim()).filter(Boolean).slice(0, 3)
        : [];
      return { insights: insights.length === 3 ? insights : fallback, aiGenerated: insights.length === 3 };
    } catch (e: any) {
      console.warn('[generateOnboardingInsights] failed, using fallback:', e?.message ?? e);
      return { insights: fallback, aiGenerated: false };
    }
  },

  // ─── Chat Session Management ────────────────────────────────────────────

  async createSession(userId: string, petId?: string) {
    const session = await AiModel.createSession(userId, petId, 'New Chat');
    return { session };
  },

  /**
   * Open a chat about an existing symptom report.
   *
   * The report is attached two ways: as the session's opening assistant message
   * so the owner sees what they are asking about, and on
   * `contextSnapshotJson` so every later turn keeps the structured findings —
   * the message alone would scroll out of the 20-message window.
   *
   * One chat per report: asking twice returns the existing session rather than
   * starting a second thread about the same episode.
   */
  async startChatFromSymptomReport(userId: string, reportId: string) {
    const report = await getSymptomReport(userId, reportId);
    if (!report) throw new NotFoundError('Symptom report not found');

    if (report.chatSessionId) {
      const existing = await AiModel.getSession(userId, report.chatSessionId);
      if (existing) return { session: existing, sessionId: existing.id, reused: true };
    }

    const title = `${report.petName ?? 'Pet'} — ${report.concern ?? report.symptoms}`.slice(0, 120);
    const session = await AiModel.createSession(userId, report.petId ?? undefined, title);
    if (!session) throw new ValidationError('Could not start a chat');

    await db
      .update(aiChatSessions)
      .set({
        contextSnapshotJson: JSON.stringify({
          kind: 'symptom_report',
          reportId: report.id,
          petName: report.petName,
          symptoms: report.symptoms,
          urgency: report.urgency,
          concern: report.concern,
          advice: report.advice,
          breedNote: report.breedNote,
          observations: report.observations,
          answers: report.answers,
          shouldSeeVet: report.shouldSeeVet,
          assessedAt: report.createdAt,
        }),
      })
      .where(eq(aiChatSessions.id, session.id));

    await AiModel.saveMessage({
      sessionId: session.id,
      role: 'assistant',
      content: formatReportForChat(report),
    });

    await db
      .update(symptomReports)
      .set({ chatSessionId: session.id })
      .where(eq(symptomReports.id, report.id));

    return { session, sessionId: session.id, reused: false };
  },

  async listSessions(userId: string) {
    const sessions = await AiModel.listSessions(userId);
    return { sessions };
  },

  async deleteSession(userId: string, sessionId: string) {
    await AiModel.deleteSession(userId, sessionId);
    return { message: 'Session deleted' };
  },

  async getMessages(userId: string, sessionId: string) {
    const session = await AiModel.getSession(userId, sessionId);
    if (!session) throw new ValidationError('Session not found');
    const messages = await AiModel.getMessages(sessionId);
    return { messages };
  },

  // ─── Chat: Send message with tool-calling loop ──────────────────────────

  async sendMessage(
    userId: string,
    sessionId: string,
    userMessage: string,
    petId?: string,
    authToken?: string,
  ) {
    // Check user token limit first
    const limitCheck = await checkUserTokenLimit(userId);
    if (!limitCheck.allowed) throw new ValidationError(limitCheck.reason ?? 'Token limit reached');

    const session = await AiModel.getSession(userId, sessionId);
    if (!session) throw new ValidationError('Session not found');

    const activePetId = petId ?? session.petId ?? undefined;

    // Determine purpose: admin session → admin_assistant, else general_chat
    const purpose: AiPurpose = (session as any).isAdminSession ? 'admin_assistant' : 'general_chat';
    const resolved = await getModelForPurpose(purpose);

    // Save user message
    await AiModel.saveMessage({ sessionId, role: 'user', content: userMessage });

    // Fetch last 20 messages for context window
    const history = await AiModel.getMessages(sessionId);
    const recentHistory = history.slice(-CONTEXT_WINDOW);
    const summary = await updateSessionSummary(session as any, history);

    // Build enriched system prompt (pet data + admin instructions)
    const basePrompt = await buildSystemPrompt(userId, activePetId);
    // Earlier turns that no longer fit the window, carried forward so the
    // thread survives a long conversation.
    const withSummary = summary
      ? `${basePrompt}\n\n[EARLIER IN THIS CONVERSATION]\n${summary}\n[END EARLIER]`
      : basePrompt;

    // A session started from a symptom report carries that report on the
    // session itself. Injecting it every turn is what keeps the thread about
    // the episode: the opening message scrolls out of the 20-message window,
    // and once it does the model has no idea what "it" refers to.
    const systemPrompt = buildContextSnapshotBlock((session as any).contextSnapshotJson, withSummary);

    // Prior turns, with each assistant message carrying a note of the tools it
    // ran so a follow-up question can refer back to those actions.
    const priorTurns = recentHistory
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(0, -1)
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.role === 'assistant' ? withToolNote(m.content ?? '', m.toolCallsJson) : m.content ?? '',
      }));

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const toolCallsLog: any[] = [];
    const copy = fallbackCopy(userMessage);

    let finalText = '';

    /**
     * Re-check the budget between tool iterations.
     *
     * The limit was only checked once, before the first call — a single message
     * that fans out into five tool round-trips could run far past a user's daily
     * cap before anything noticed.
     */
    const budgetExhausted = async () => !(await checkUserTokenLimit(userId)).allowed;

    // ── Route to correct provider ─────────────────────────────────────
    if (resolved.provider === 'openai' || resolved.provider === 'deepseek' || resolved.provider === 'openai_custom') {
      // OpenAI / DeepSeek (OpenAI-compatible API)
      const oaiClient = buildOpenAIClient(resolved);
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...priorTurns,
        { role: 'user', content: userMessage },
      ];

      // Tool-calling loop (max 5 iterations)
      for (let iter = 0; iter < 5; iter++) {
        if (iter > 0 && (await budgetExhausted())) break;
        const res = await oaiClient.chat.completions.create({
          model: resolved.modelName,
          messages,
          tools: AI_TOOL_DECLARATIONS.map(t => ({
            type: 'function' as const,
            function: { name: t.name, description: t.description, parameters: t.parameters },
          })),
          tool_choice: 'auto',
        });

        totalInputTokens += res.usage?.prompt_tokens ?? 0;
        totalOutputTokens += res.usage?.completion_tokens ?? 0;

        const choice = res.choices[0];
        const msg = choice.message;

        if (!msg.tool_calls || msg.tool_calls.length === 0) {
          finalText = msg.content ?? '';
          break;
        }

        // Execute tools
        messages.push(msg as any);
        for (const tc of msg.tool_calls) {
          if (tc.type !== 'function') continue;
          const args = JSON.parse(tc.function.arguments ?? '{}');
          const toolResult = await executeTool(tc.function.name, args, userId, authToken);
          toolCallsLog.push({ tool: tc.function.name, args, result: toolResult });
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(toolResult) });
        }
      }

    } else if (resolved.provider === 'anthropic' || resolved.provider === 'anthropic_custom') {
      // Anthropic / Anthropic-compatible proxy
      const anthropic = buildAnthropicClient(resolved);
      const anthropicMsgs: Anthropic.MessageParam[] = priorTurns.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      anthropicMsgs.push({ role: 'user', content: userMessage });

      // Tool-calling loop (max 5 iterations)
      for (let iter = 0; iter < 5; iter++) {
        if (iter > 0 && (await budgetExhausted())) break;
        const res = await anthropic.messages.create({
          model: resolved.modelName,
          max_tokens: 4096,
          system: systemPrompt,
          messages: anthropicMsgs,
          tools: AI_TOOL_DECLARATIONS.map(t => ({
            name: t.name,
            description: t.description ?? '',
            input_schema: (t.parameters ?? { type: 'object', properties: {} }) as Anthropic.Tool['input_schema'],
          })),
        });

        totalInputTokens += res.usage?.input_tokens ?? 0;
        totalOutputTokens += res.usage?.output_tokens ?? 0;

        const toolUseBlocks = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
        const textBlocks = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');

        if (toolUseBlocks.length === 0) {
          finalText = textBlocks.map(b => b.text).join('\n');
          break;
        }

        // Execute tools and feed back
        anthropicMsgs.push({ role: 'assistant', content: res.content });
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const tu of toolUseBlocks) {
          const toolResult = await executeTool(tu.name, tu.input as Record<string, any>, userId, authToken);
          toolCallsLog.push({ tool: tu.name, args: tu.input, result: toolResult });
          toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(toolResult) });
        }
        anthropicMsgs.push({ role: 'user', content: toolResults });
      }

    } else {
      // ── Gemini (default) ────────────────────────────────────────────
      // Built here rather than up front: the Gemini client used to be
      // constructed on every request regardless of provider, handing an
      // Anthropic or OpenAI key to Google's SDK for an object nobody used.
      const chat = buildGeminiChatModel(resolved, true).startChat({
        history: priorTurns.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        systemInstruction: { role: 'user', parts: [{ text: systemPrompt }] },
      });

      let currentMessage: any = userMessage;

      for (let iteration = 0; iteration < 5; iteration++) {
        if (iteration > 0 && (await budgetExhausted())) break;
        const result = await chat.sendMessage(currentMessage);
        const response = result.response;
        const usage = response.usageMetadata;

        totalInputTokens += usage?.promptTokenCount ?? 0;
        totalOutputTokens += usage?.candidatesTokenCount ?? 0;

        const candidate = response.candidates?.[0];
        const parts = candidate?.content?.parts ?? [];
        const functionCalls = parts.filter((p: any) => p.functionCall);

        if (functionCalls.length === 0) {
          finalText = response.text();
          break;
        }

        const toolResults: any[] = [];
        for (const part of functionCalls) {
          const fc = part.functionCall;
          if (!fc) continue;
          const toolResult = await executeTool(fc.name, (fc.args as Record<string, any>) ?? {}, userId, authToken);
          toolCallsLog.push({ tool: fc.name, args: fc.args, result: toolResult });
          toolResults.push({ functionResponse: { name: fc.name, response: { result: toolResult } } });
        }
        currentMessage = toolResults;
      }
    }

    /**
     * The loop can end with tools still pending — five iterations is a hard
     * stop, not a natural end. That left `finalText` empty and the user was
     * told the assistant had failed, even though the tools had already run and
     * changed their data (a task really was created). They would then retry and
     * duplicate it.
     *
     * So: ask once more with no tools available, which forces a written answer
     * from everything gathered. Only if that also fails do we admit defeat, and
     * then we say what was actually done rather than pretending nothing was.
     */
    if (!finalText && toolCallsLog.length > 0) {
      try {
        const recap = toolCallsLog
          .map((t) => `- ${t.tool}(${JSON.stringify(t.args ?? {})}) -> ${String(t.result).slice(0, 500)}`)
          .join('\n');
        const wrapUp = await generateText(
          resolved,
          `${systemPrompt}\n\nThe user said: "${userMessage}"\n\nYou already performed these actions and got these results:\n${recap}\n\nWrite the reply to the user now. Confirm what you did, in their language. Do not ask to run anything else.`,
          1024,
        );
        finalText = wrapUp.text.trim();
        totalInputTokens += wrapUp.inputTokens;
        totalOutputTokens += wrapUp.outputTokens;
      } catch (e: any) {
        console.warn('[sendMessage] wrap-up call failed:', e?.message ?? e);
      }

      if (!finalText) {
        finalText = `${copy.didActions}\n${toolCallsLog.map((t) => `• ${t.tool}`).join('\n')}`;
      }
    }

    if (!finalText) finalText = copy.failed;

    /**
     * Record what the provider actually reported.
     *
     * These used to fall back to `|| 500` and `|| 300`, so a provider that
     * omits usage (Ollama and several OpenAI-compatible proxies do) had
     * invented numbers written against the user's limit, the model's daily
     * stats and the cost report — silently, and wrong in both directions.
     */
    if (totalInputTokens === 0 && totalOutputTokens === 0) {
      console.warn(
        `[sendMessage] ${resolved.provider}/${resolved.modelName} reported no token usage; recording zero rather than estimating`,
      );
    }

    // Save assistant message with tool call log
    await AiModel.saveMessage({
      sessionId,
      role: 'assistant',
      content: finalText,
      toolCallsJson: toolCallsLog.length > 0 ? JSON.stringify(toolCallsLog) : undefined,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    });

    // Log token usage via recordTokenUsage (updates user counters + model daily stats)
    await recordTokenUsage({
      userId,
      petId: activePetId,
      sessionId,
      model: resolved,
      feature: 'chat',
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    });

    // Auto-title session from first message
    if (history.length <= 1) {
      await AiModel.updateSessionTitle(sessionId, userMessage.slice(0, 60));
    }

    // Background memory enrichment: extract durable pet facts from this
    // exchange without blocking the reply. Fire-and-forget — never await.
    if (activePetId && finalText) {
      void PetProfileService.extractFactsFromMessage({
        userId,
        petId: activePetId,
        sessionId,
        userText: userMessage,
        assistantText: finalText,
      });
    }

    return {
      message: finalText,
      sessionId,
      toolsUsed: toolCallsLog.map((t) => t.tool),
    };
  },

  /**
   * Streaming counterpart of `sendMessage`.
   *
   * Same tool loop, same persistence, same fact extraction — the only
   * difference is that text reaches the caller as it is produced instead of
   * 10–20 seconds later. Everything that must happen exactly once (saving the
   * message, recording tokens, titling the session) happens here after the
   * stream completes, so a client that disconnects mid-reply still leaves the
   * session consistent.
   */
  async *streamMessage(
    userId: string,
    sessionId: string,
    userMessage: string,
    petId?: string,
    authToken?: string,
    image?: ChatImage,
  ): AsyncGenerator<ChatStreamEvent, void, unknown> {
    const limitCheck = await checkUserTokenLimit(userId);
    if (!limitCheck.allowed) throw new ValidationError(limitCheck.reason ?? 'Token limit reached');

    const session = await AiModel.getSession(userId, sessionId);
    if (!session) throw new ValidationError('Session not found');

    const activePetId = petId ?? session.petId ?? undefined;
    const purpose: AiPurpose = (session as any).isAdminSession ? 'admin_assistant' : 'general_chat';
    const resolved = await getModelForPurpose(purpose);

    /**
     * Not every chat model can see.
     *
     * The chat model is admin-configurable, and a text-only one (DeepSeek, most
     * local Ollama models) rejects a multimodal message outright — the user
     * would get a raw provider error for attaching a photo. So when the chat
     * model isn't vision-capable, the image goes to the model configured for
     * the `vision` purpose instead and its description is folded into the
     * message. The conversation still "sees" the photo either way.
     */
    let visionNote = '';
    let inlineImage = image;
    if (image && !modelSupportsVision(resolved)) {
      inlineImage = undefined;
      try {
        const visionModel = await getModelForPurpose('vision');
        const seen = await analyzePetImage(image.base64, image.mimeType, visionModel);
        visionNote = `\n\n[The user attached a photo. Image analysis: ${seen.rawAnalysis}${
          seen.petType !== 'not_animal' ? ` Detected: ${seen.breed} (${seen.petType}), ${seen.color}, ${seen.estimatedAge}.` : ''
        }]`;
      } catch (e: any) {
        console.warn('[streamMessage] vision fallback failed:', e?.message ?? e);
        visionNote = '\n\n[The user attached a photo, but it could not be analysed.]';
      }
    }

    // The image itself is not stored on the message — a base64 photo in a chat
    // row would bloat every history read — so the transcript records that one
    // was sent.
    await AiModel.saveMessage({
      sessionId,
      role: 'user',
      content: image ? `${userMessage}\n[user attached a photo]` : userMessage,
    });

    const history = await AiModel.getMessages(sessionId);
    const recentHistory = history.slice(-CONTEXT_WINDOW);
    const summary = await updateSessionSummary(session as any, history);
    const basePrompt = await buildSystemPrompt(userId, activePetId);
    // Earlier turns that no longer fit the window, carried forward so the
    // thread survives a long conversation.
    const withSummary = summary
      ? `${basePrompt}\n\n[EARLIER IN THIS CONVERSATION]\n${summary}\n[END EARLIER]`
      : basePrompt;

    // A session started from a symptom report carries that report on the
    // session itself. Injecting it every turn is what keeps the thread about
    // the episode: the opening message scrolls out of the 20-message window,
    // and once it does the model has no idea what "it" refers to.
    const systemPrompt = buildContextSnapshotBlock((session as any).contextSnapshotJson, withSummary);
    const copy = fallbackCopy(userMessage);

    const priorTurns = recentHistory
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(0, -1)
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.role === 'assistant' ? withToolNote(m.content ?? '', m.toolCallsJson) : m.content ?? '',
      }));

    let finalMessage = '';
    let toolCalls: { tool: string; args: unknown; result: string }[] = [];
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const event of streamChatTurn({
      resolved,
      systemPrompt,
      priorTurns,
      userMessage: userMessage + visionNote,
      image: inlineImage,
      userId,
      authToken,
      budgetExhausted: async () => !(await checkUserTokenLimit(userId)).allowed,
    })) {
      if (event.type === 'done') {
        finalMessage = event.message;
        toolCalls = event.toolCalls;
        inputTokens = event.inputTokens;
        outputTokens = event.outputTokens;
      } else {
        yield event;
      }
    }

    // Same wrap-up as the blocking path: tools may have run without the model
    // ever writing an answer, and saying "I couldn't help" after changing the
    // user's data would be a lie.
    if (!finalMessage && toolCalls.length > 0) {
      try {
        const recap = toolCalls
          .map((t) => `- ${t.tool}(${JSON.stringify(t.args ?? {})}) -> ${String(t.result).slice(0, 500)}`)
          .join('\n');
        const wrapUp = await generateText(
          resolved,
          `${systemPrompt}\n\nThe user said: "${userMessage}"\n\nYou already performed these actions and got these results:\n${recap}\n\nWrite the reply to the user now. Confirm what you did, in their language.`,
          1024,
        );
        finalMessage = wrapUp.text.trim();
        inputTokens += wrapUp.inputTokens;
        outputTokens += wrapUp.outputTokens;
        if (finalMessage) yield { type: 'delta', text: finalMessage };
      } catch (e: any) {
        console.warn('[streamMessage] wrap-up failed:', e?.message ?? e);
      }
      if (!finalMessage) {
        finalMessage = `${copy.didActions}\n${toolCalls.map((t) => `• ${t.tool}`).join('\n')}`;
        yield { type: 'delta', text: finalMessage };
      }
    }

    if (!finalMessage) {
      finalMessage = copy.failed;
      yield { type: 'delta', text: finalMessage };
    }

    await AiModel.saveMessage({
      sessionId,
      role: 'assistant',
      content: finalMessage,
      toolCallsJson: toolCalls.length > 0 ? JSON.stringify(toolCalls) : undefined,
      inputTokens,
      outputTokens,
    });

    await recordTokenUsage({
      userId,
      petId: activePetId,
      sessionId,
      model: resolved,
      feature: 'chat',
      inputTokens,
      outputTokens,
    });

    if (history.length <= 1) {
      await AiModel.updateSessionTitle(sessionId, userMessage.slice(0, 60));
    }

    if (activePetId && finalMessage) {
      void PetProfileService.extractFactsFromMessage({
        userId,
        petId: activePetId,
        sessionId,
        userText: userMessage,
        assistantText: finalMessage,
      });
    }

    yield {
      type: 'done',
      message: finalMessage,
      toolCalls,
      inputTokens,
      outputTokens,
    };
  },

  // ─── Proactive daily check-in ─────────────────────────────────────────────

  /**
   * Generate ONE short, warm, AI-written check-in opening about a specific pet,
   * using its profile + learned facts (Phase 2 memory). Falls back to a simple
   * pet-name greeting if the model call fails (quota/network) — never throws.
   */
  /**
   * Write one proactive message in the assistant's own voice, using everything
   * known about the pet.
   *
   * Every self-initiated message in the app funnels through here — check-ins,
   * missed-task nudges, symptom follow-ups, weekly reviews. Templates could not
   * say "Bruno's kidney diet means the evening dose matters more than most";
   * this can. `fallback` is always a complete, sendable message, because the
   * model may be unconfigured, rate-limited, or simply down and the owner still
   * deserves the reminder.
   */
  async generateProactiveMessage(opts: {
    userId: string;
    petId?: string;
    /** What to say, in plain instructions. Appended to the pet context prompt. */
    task: string;
    fallback: string;
    /** Token-accounting label. */
    feature: string;
  }): Promise<string> {
    try {
      const resolved = await getModelForPurpose('general_chat');
      // Used to bail unless the provider was Google, so switching the model to
      // Anthropic or OpenAI in the admin panel quietly replaced every
      // AI-written message with a canned template.
      if (!resolved.apiKey) return opts.fallback;

      const context = await buildSystemPrompt(opts.userId, opts.petId);
      const prompt = `${context}

TASK: ${opts.task}

Keep it warm and short (1-2 sentences), personal to this pet, and respond in the user's language (Bengali if their data is Bengali). Return ONLY the message text — no quotes, no preamble.`;

      const { text, inputTokens, outputTokens } = await generateText(resolved, prompt, 512);
      await recordTokenUsage({
        userId: opts.userId,
        petId: opts.petId,
        model: resolved,
        feature: opts.feature,
        inputTokens,
        outputTokens,
      });
      return text.trim() || opts.fallback;
    } catch (e: any) {
      console.warn(`[${opts.feature}] AI copy failed, using fallback:`, e?.message ?? e);
      return opts.fallback;
    }
  },

  async generateProactiveCheckin(userId: string, petId?: string, petName?: string): Promise<string> {
    return this.generateProactiveMessage({
      userId,
      petId,
      feature: 'proactive_checkin',
      fallback: petName
        ? `${petName} আজ কেমন আছে? কিছু জানালে আমি ওর যত্নে সাহায্য করতে পারি।`
        : `তোমার পোষা প্রাণী আজ কেমন আছে? কিছু জানালে আমি সাহায্য করতে পারি।`,
      task: 'Write ONE proactive daily check-in opening message to the pet owner, as if you (their AI pet assistant) are reaching out first to see how the pet is doing today. Use what you know about the pet (name, profile, facts) to make it personal and specific. Ask an open question that invites them to share an update.',
    });
  },

  // ─── Care Plan ──────────────────────────────────────────────────────────

  /**
   * Preview by default — the app shows the plan for review before anything is
   * created. Pass `apply` to create tasks/reminders in the same call.
   */
  async generateCarePlan(userId: string, petId: string, opts: { apply?: boolean } = {}) {
    const carePlan = await CarePlanService.generate(userId, petId, opts);
    return { success: true, carePlan, applied: Boolean(opts.apply) };
  },

  /** Create tasks + reminders from the plan the user approved. */
  async applyCarePlan(userId: string, petId: string, plan: Partial<CarePlan>) {
    const result = await CarePlanService.apply(userId, petId, plan);
    return { success: true, ...result };
  },

  async getCarePlan(petId: string) {
    const plan = await AiModel.getActivePetCarePlan(petId);
    return { carePlan: plan };
  },
};
