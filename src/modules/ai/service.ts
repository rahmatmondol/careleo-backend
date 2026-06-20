import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { AiModel } from './model';
import { analyzePetImage, type PetVisionResult } from './vision';
import { CarePlanService } from './care-plan';
import { AI_TOOL_DECLARATIONS, executeTool } from './tools';
import { ValidationError } from '@/shared/errors';
import { PetProfileModel } from '@/modules/pet-profile/model';
import { PetProfileService } from '@/modules/pet-profile/service';
import { CORE_PROFILING_QUESTIONS, CORE_QUESTION_IDS } from './profiling-questions';
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

  async generateOnboardingQuestions(
    userId: string,
    petType: string,
    breed: string,
    estimatedAge: string,
    weight?: string,
  ) {
    const limitCheck = await checkUserTokenLimit(userId);
    if (!limitCheck.allowed) throw new ValidationError(limitCheck.reason ?? 'Token limit reached');

    const resolved = await getModelForPurpose('onboarding');
    const genAI = new GoogleGenerativeAI(resolved.apiKey);
    const model = genAI.getGenerativeModel({ model: resolved.modelName });

    const prompt = `You are a veterinary expert. Generate a JSON array of onboarding questions for a new pet owner.

Pet details:
- Type: ${petType}
- Breed: ${breed || 'Unknown'}
- Estimated age: ${estimatedAge || 'Unknown'}
- Weight: ${weight || 'Unknown'}

Generate 4-6 questions that are:
1. Highly SPECIFIC to this species, breed, age, and weight (e.g. breed-typical health risks, weight-appropriate diet, age-stage needs)
2. NOT about these already-covered basics (do not repeat these — they are asked separately): diet brand, daily food amount, allergies, health conditions, medications, vaccination status, general activity level
3. Written in a friendly, conversational tone

Return a JSON array with this exact structure:
[
  {
    "id": "unique_key",
    "title": "Section Title",
    "question": "The question text",
    "type": "single_choice" | "multi_select" | "numeric" | "text",
    "unit": "kg" or "cups" etc (only for numeric type),
    "options": ["Option 1", "Option 2"] (only for choice types),
    "required": true | false,
    "tip": "Optional helpful tip specific to this breed"
  }
]

Return ONLY valid JSON array. No markdown, no extra text.`;

    // Hybrid: fixed core questions are always returned (guaranteed coverage).
    // The AI's breed/species-specific extras are added on top — but if the AI
    // call fails (quota, network, bad JSON), we still return the core set so
    // onboarding never breaks.
    let extras: any[] = [];
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const usageMetadata = result.response.usageMetadata;

      await recordTokenUsage({
        userId,
        model: resolved,
        feature: 'onboarding',
        inputTokens: usageMetadata?.promptTokenCount ?? 300,
        outputTokens: usageMetadata?.candidatesTokenCount ?? 500,
      });

      const aiQuestions = parseJson(text);
      extras = Array.isArray(aiQuestions)
        ? aiQuestions.filter((q: any) => q?.id && !CORE_QUESTION_IDS.includes(q.id))
        : [];
    } catch (e: any) {
      console.warn('[generateOnboardingQuestions] AI generation failed, using core only:', e?.message ?? e);
    }

    const questions = [...CORE_PROFILING_QUESTIONS, ...extras];
    return { questions, aiGenerated: extras.length > 0 };
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

  async generateCarePlan(userId: string, petId: string) {
    const carePlan = await CarePlanService.generate(userId, petId);
    return { success: true, carePlan };
  },

  async getCarePlan(petId: string) {
    const plan = await AiModel.getActivePetCarePlan(petId);
    return { carePlan: plan };
  },
};
