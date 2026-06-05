/**
 * ModelRegistry — central service for resolving which AI model/provider
 * to use for a given purpose, and for enforcing token limits.
 *
 * Purpose values:
 *   general_chat     → normal user AI chat
 *   vision           → pet image / symptom / report analysis
 *   store_assistant  → e-commerce store AI assistant
 *   admin_assistant  → admin panel AI assistant
 *   care_plan        → care plan generation
 *   onboarding       → onboarding questions
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import { aiModelConfigs, userAiTokenLimits, aiTokenUsage } from '@/shared/db/schema/ai.schema';

export type AiPurpose =
  | 'general_chat'
  | 'vision'
  | 'store_assistant'
  | 'admin_assistant'
  | 'care_plan'
  | 'onboarding';

export interface ResolvedModel {
  id: string;
  provider: string;
  modelName: string;
  apiKey: string;
  baseUrl?: string;        // custom endpoint for deepseek / openai-compatible / anthropic-compatible
  purpose: string;
  costPer1kInput: number;
  costPer1kOutput: number;
  maxTokensPerDay: number | null;
  maxTokensPerUserDay: number | null;
}

// ─── In-memory cache (5-min TTL) ─────────────────────────────────────────────
const cache = new Map<string, { model: ResolvedModel; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheGet(purpose: string): ResolvedModel | null {
  const entry = cache.get(purpose);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { cache.delete(purpose); return null; }
  return entry.model;
}

function cacheSet(purpose: string, model: ResolvedModel) {
  cache.set(purpose, { model, ts: Date.now() });
}

export function invalidateModelCache() {
  cache.clear();
}

// ─── Default fallback (env-based) ────────────────────────────────────────────
function buildFallback(purpose: AiPurpose): ResolvedModel {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY ?? '';
  const isVision = purpose === 'vision';
  return {
    id: 'fallback',
    provider: 'google',
    modelName: isVision ? 'gemini-1.5-flash' : 'gemini-2.0-flash',
    apiKey,
    purpose,
    costPer1kInput: isVision ? 0.000075 : 0.00125,
    costPer1kOutput: isVision ? 0.0003 : 0.005,
    maxTokensPerDay: null,
    maxTokensPerUserDay: null,
  };
}

// ─── Main resolver ────────────────────────────────────────────────────────────
export async function getModelForPurpose(purpose: AiPurpose): Promise<ResolvedModel> {
  const cached = cacheGet(purpose);
  if (cached) return cached;

  const rows = await db
    .select()
    .from(aiModelConfigs)
    .where(and(eq(aiModelConfigs.purpose, purpose), eq(aiModelConfigs.isActive, true)))
    .limit(1);

  if (rows.length === 0) return buildFallback(purpose);

  const r = rows[0];
  const model: ResolvedModel = {
    id: r.id,
    provider: r.provider,
    modelName: r.modelName,
    apiKey: r.apiKeyEncrypted,
    baseUrl: r.baseUrl ?? undefined,
    purpose: r.purpose,
    costPer1kInput: Number(r.costPer1kInput ?? 0.00125),
    costPer1kOutput: Number(r.costPer1kOutput ?? 0.005),
    maxTokensPerDay: r.maxTokensPerDay ?? null,
    maxTokensPerUserDay: r.maxTokensPerUserDay ?? null,
  };

  cacheSet(purpose, model);
  return model;
}

// ─── User token limit check ───────────────────────────────────────────────────
export interface TokenLimitResult {
  allowed: boolean;
  reason?: string;
  tokensToday: number;
  tokensMonth: number;
  dailyLimit: number | null;
  monthlyLimit: number | null;
}

export async function checkUserTokenLimit(userId: string): Promise<TokenLimitResult> {
  const rows = await db
    .select()
    .from(userAiTokenLimits)
    .where(eq(userAiTokenLimits.userId, userId))
    .limit(1);

  if (rows.length === 0) return { allowed: true, tokensToday: 0, tokensMonth: 0, dailyLimit: null, monthlyLimit: null };

  const limit = rows[0];

  // Hard block
  if (limit.isBlocked) {
    return {
      allowed: false,
      reason: limit.blockReason ?? 'Your AI access has been blocked by admin.',
      tokensToday: limit.tokensToday ?? 0,
      tokensMonth: limit.tokensMonth ?? 0,
      dailyLimit: limit.dailyLimit,
      monthlyLimit: limit.monthlyLimit,
    };
  }

  // Reset counters if needed
  const now = new Date();
  const resetDay = limit.resetDayAt ? new Date(limit.resetDayAt) : new Date(0);
  const resetMonth = limit.resetMonthAt ? new Date(limit.resetMonthAt) : new Date(0);

  let tokensToday = limit.tokensToday ?? 0;
  let tokensMonth = limit.tokensMonth ?? 0;

  if (now.toDateString() !== resetDay.toDateString()) {
    tokensToday = 0;
    await db.update(userAiTokenLimits)
      .set({ tokensToday: 0, resetDayAt: now, updatedAt: now })
      .where(eq(userAiTokenLimits.userId, userId));
  }

  if (now.getMonth() !== resetMonth.getMonth() || now.getFullYear() !== resetMonth.getFullYear()) {
    tokensMonth = 0;
    await db.update(userAiTokenLimits)
      .set({ tokensMonth: 0, resetMonthAt: now, updatedAt: now })
      .where(eq(userAiTokenLimits.userId, userId));
  }

  // Check daily limit
  if (limit.dailyLimit && tokensToday >= limit.dailyLimit) {
    return {
      allowed: false,
      reason: `Daily AI token limit reached (${tokensToday}/${limit.dailyLimit}). Resets tomorrow.`,
      tokensToday,
      tokensMonth,
      dailyLimit: limit.dailyLimit,
      monthlyLimit: limit.monthlyLimit,
    };
  }

  // Check monthly limit
  if (limit.monthlyLimit && tokensMonth >= limit.monthlyLimit) {
    return {
      allowed: false,
      reason: `Monthly AI token limit reached (${tokensMonth}/${limit.monthlyLimit}). Resets next month.`,
      tokensToday,
      tokensMonth,
      dailyLimit: limit.dailyLimit,
      monthlyLimit: limit.monthlyLimit,
    };
  }

  return { allowed: true, tokensToday, tokensMonth, dailyLimit: limit.dailyLimit, monthlyLimit: limit.monthlyLimit };
}

// ─── Record token usage + update limits ──────────────────────────────────────
export async function recordTokenUsage(params: {
  userId: string;
  petId?: string;
  sessionId?: string;
  model: ResolvedModel;
  feature: string;
  inputTokens: number;
  outputTokens: number;
}) {
  const { userId, petId, sessionId, model, feature, inputTokens, outputTokens } = params;
  const totalTokens = inputTokens + outputTokens;
  const costUsd = (inputTokens / 1000) * model.costPer1kInput + (outputTokens / 1000) * model.costPer1kOutput;

  // Write to ai_token_usage (non-fatal)
  try {
    await db.insert(aiTokenUsage).values({
      userId,
      petId,
      sessionId,
      modelName: model.modelName,
      feature,
      inputTokens,
      outputTokens,
      totalTokens,
      costUsd: costUsd.toFixed(6),
    });
  } catch (e: any) {
    console.warn('[recordTokenUsage] ai_token_usage insert failed:', e?.message);
  }

  // Update user daily/monthly counters (upsert) — non-fatal
  try {
    await db.execute(sql`
      INSERT INTO user_ai_token_limits (user_id, tokens_today, tokens_month, updated_at)
      VALUES (${userId}, ${totalTokens}, ${totalTokens}, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        tokens_today = user_ai_token_limits.tokens_today + ${totalTokens},
        tokens_month = user_ai_token_limits.tokens_month + ${totalTokens},
        updated_at = NOW()
    `);
  } catch (e: any) {
    console.warn('[recordTokenUsage] user_ai_token_limits upsert failed:', e?.message);
  }

  // Update model daily stats (upsert) — non-fatal
  if (model.id !== 'fallback') {
    try {
      await db.execute(sql`
        INSERT INTO ai_model_daily_stats (model_config_id, stat_date, total_calls, total_tokens, total_cost_usd)
        VALUES (${model.id}, CURRENT_DATE, 1, ${totalTokens}, ${costUsd})
        ON CONFLICT (model_config_id, stat_date) DO UPDATE SET
          total_calls = ai_model_daily_stats.total_calls + 1,
          total_tokens = ai_model_daily_stats.total_tokens + ${totalTokens},
          total_cost_usd = ai_model_daily_stats.total_cost_usd + ${costUsd}
      `);
    } catch (e: any) {
      console.warn('[recordTokenUsage] ai_model_daily_stats upsert failed:', e?.message);
    }
  }
}
