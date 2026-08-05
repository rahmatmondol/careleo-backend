import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { AiModel } from './model';
import { analyzePetImage, type PetVisionResult } from './vision';
import { CarePlanService, type CarePlan } from './care-plan';
import { AI_TOOL_DECLARATIONS, executeTool } from './tools';
import { ValidationError } from '@/shared/errors';
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

function parseJson(text: string) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(cleaned);
}

/**
 * One-shot text generation that honours the resolved provider instead of
 * assuming Gemini. Returns the text plus usage so callers can record tokens.
 */
async function generateText(
  resolved: ResolvedModel,
  prompt: string,
  maxTokens = 2048,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  if (resolved.provider === 'openai' || resolved.provider === 'deepseek' || resolved.provider === 'openai_custom') {
    const client = buildOpenAIClient(resolved);
    const res = await client.chat.completions.create({
      model: resolved.modelName,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
    });
    return {
      text: res.choices[0]?.message?.content ?? '',
      inputTokens: res.usage?.prompt_tokens ?? 0,
      outputTokens: res.usage?.completion_tokens ?? 0,
    };
  }

  if (resolved.provider === 'anthropic' || resolved.provider === 'anthropic_custom') {
    const client = buildAnthropicClient(resolved);
    const res = await client.messages.create({
      model: resolved.modelName,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return {
      text,
      inputTokens: res.usage?.input_tokens ?? 0,
      outputTokens: res.usage?.output_tokens ?? 0,
    };
  }

  const genAI = new GoogleGenerativeAI(resolved.apiKey);
  const model = genAI.getGenerativeModel({ model: resolved.modelName });
  const result = await model.generateContent(prompt);
  const usage = result.response.usageMetadata;
  return {
    text: result.response.text() ?? '',
    inputTokens: usage?.promptTokenCount ?? 0,
    outputTokens: usage?.candidatesTokenCount ?? 0,
  };
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
export async function buildSystemPrompt(userId: string, petId?: string): Promise<string> {
  const allPets = await AiModel.getUserPets(userId);
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

  return `You are Careleo AI, a caring and knowledgeable pet care assistant.
Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
${adminBlock}
${petsBlock}${memoryBlock}

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
- Record vaccinations with add_vaccination (a due date sets a reminder).`;
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
          inputTokens: inputTokens || 300,
          outputTokens: outputTokens || 500,
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
        inputTokens: inputTokens || 300,
        outputTokens: outputTokens || 150,
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
    const recentHistory = history.slice(-20);

    // Build enriched system prompt (pet data + admin instructions)
    const systemPrompt = await buildSystemPrompt(userId, activePetId);

    // Convert DB history to Gemini format (exclude the message just saved)
    const chatHistory = recentHistory
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(0, -1)
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content ?? '' }],
      }));

    const geminiModel = buildGeminiChatModel(resolved, true);
    const chat = geminiModel.startChat({
      history: chatHistory,
      systemInstruction: { role: 'user', parts: [{ text: systemPrompt }] },
    });

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const toolCallsLog: any[] = [];

    let finalText = '';

    // ── Route to correct provider ─────────────────────────────────────
    if (resolved.provider === 'openai' || resolved.provider === 'deepseek' || resolved.provider === 'openai_custom') {
      // OpenAI / DeepSeek (OpenAI-compatible API)
      const oaiClient = buildOpenAIClient(resolved);
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...recentHistory
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .slice(0, -1)
          .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content ?? '' })),
        { role: 'user', content: userMessage },
      ];

      // Tool-calling loop (max 5 iterations)
      for (let iter = 0; iter < 5; iter++) {
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
      const anthropicMsgs: Anthropic.MessageParam[] = recentHistory
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(0, -1)
        .map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content ?? '',
        }));
      anthropicMsgs.push({ role: 'user', content: userMessage });

      // Tool-calling loop (max 5 iterations)
      for (let iter = 0; iter < 5; iter++) {
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
      let currentMessage: any = userMessage;

      for (let iteration = 0; iteration < 5; iteration++) {
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

    if (!finalText) {
      finalText = 'আমি তোমাকে সাহায্য করতে পারলাম না। আবার চেষ্টা করো।';
    }

    // Save assistant message with tool call log
    await AiModel.saveMessage({
      sessionId,
      role: 'assistant',
      content: finalText,
      toolCallsJson: toolCallsLog.length > 0 ? JSON.stringify(toolCallsLog) : undefined,
      inputTokens: totalInputTokens || 500,
      outputTokens: totalOutputTokens || 300,
    });

    // Log token usage via recordTokenUsage (updates user counters + model daily stats)
    await recordTokenUsage({
      userId,
      petId: activePetId,
      sessionId,
      model: resolved,
      feature: 'chat',
      inputTokens: totalInputTokens || 500,
      outputTokens: totalOutputTokens || 300,
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

  // ─── Proactive daily check-in ─────────────────────────────────────────────

  /**
   * Generate ONE short, warm, AI-written check-in opening about a specific pet,
   * using its profile + learned facts (Phase 2 memory). Falls back to a simple
   * pet-name greeting if the model call fails (quota/network) — never throws.
   */
  async generateProactiveCheckin(userId: string, petId?: string, petName?: string): Promise<string> {
    const fallback = petName
      ? `${petName} আজ কেমন আছে? কিছু জানালে আমি ওর যত্নে সাহায্য করতে পারি।`
      : `তোমার পোষা প্রাণী আজ কেমন আছে? কিছু জানালে আমি সাহায্য করতে পারি।`;
    try {
      const resolved = await getModelForPurpose('general_chat');
      if (resolved.provider !== 'google' || !resolved.apiKey) return fallback;

      const context = await buildSystemPrompt(userId, petId);
      const prompt = `${context}

TASK: Write ONE proactive daily check-in opening message to the pet owner, as if you (their AI pet assistant) are reaching out first to see how the pet is doing today. Use what you know about the pet (name, profile, facts) to make it personal and specific. Keep it warm and short (1-2 sentences). Ask an open question that invites them to share an update. Respond in the user's language (Bengali if their data is Bengali). Return ONLY the message text — no quotes, no preamble.`;

      const genAI = new GoogleGenerativeAI(resolved.apiKey);
      const model = genAI.getGenerativeModel({ model: resolved.modelName });
      const result = await model.generateContent(prompt);
      const text = (result.response.text() ?? '').trim();
      const usage = result.response.usageMetadata;
      await recordTokenUsage({
        userId,
        petId,
        model: resolved,
        feature: 'proactive_checkin',
        inputTokens: usage?.promptTokenCount ?? 200,
        outputTokens: usage?.candidatesTokenCount ?? 60,
      });
      return text || fallback;
    } catch (e: any) {
      console.warn('[generateProactiveCheckin] failed, using fallback:', e?.message ?? e);
      return fallback;
    }
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
