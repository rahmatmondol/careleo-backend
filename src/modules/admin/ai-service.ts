import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import {
  aiChatMessages,
  aiChatSessions,
  aiModelConfigs,
  aiTokenUsage,
  adminAiInstructions,
  petCarePlans,
  userAiTokenLimits,
  aiModelDailyStats,
} from '@/shared/db/schema/ai.schema';
import { pets, users } from '@/shared/db/schema';
import { invalidateModelCache } from '@/modules/ai/model-registry';
import { validateAndNormalizeProvider } from '@/modules/ai/provider-catalog';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// ─── Period helpers ───────────────────────────────────────────────────────
function periodStart(period: string): Date {
  const now = new Date();
  switch (period) {
    case 'day':   return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case 'week':  { const d = new Date(now); d.setDate(now.getDate() - 7); return d; }
    case 'month': return new Date(now.getFullYear(), now.getMonth(), 1);
    default:      return new Date(0); // 'all'
  }
}

export const AdminAiService = {

  // ─── Token Usage ──────────────────────────────────────────────────────

  async getTokenUsageSummary(period = 'month') {
    const since = periodStart(period);

    const rows = await db
      .select({
        model: aiTokenUsage.modelName,
        feature: aiTokenUsage.feature,
        totalTokens: sql<number>`sum(${aiTokenUsage.totalTokens})::int`,
        totalCost:   sql<number>`sum(${aiTokenUsage.costUsd})::float`,
        callCount:   sql<number>`count(*)::int`,
      })
      .from(aiTokenUsage)
      .where(gte(aiTokenUsage.createdAt, since))
      .groupBy(aiTokenUsage.modelName, aiTokenUsage.feature);

    const totalTokens = rows.reduce((s, r) => s + (r.totalTokens ?? 0), 0);
    const totalCostUsd = rows.reduce((s, r) => s + (r.totalCost ?? 0), 0);
    const totalCalls   = rows.reduce((s, r) => s + (r.callCount ?? 0), 0);

    const byModel: Record<string, number> = {};
    const byFeature: Record<string, number> = {};
    for (const r of rows) {
      byModel[r.model]     = (byModel[r.model] ?? 0) + (r.totalTokens ?? 0);
      byFeature[r.feature] = (byFeature[r.feature] ?? 0) + (r.totalTokens ?? 0);
    }

    return { totalTokens, totalCostUsd, totalCalls, byModel, byFeature };
  },

  async getTokenUsageByUser(period = 'month', page = 1, limit = 20) {
    const since = periodStart(period);
    const offset = (page - 1) * limit;

    return db
      .select({
        userId:      aiTokenUsage.userId,
        totalTokens: sql<number>`sum(${aiTokenUsage.totalTokens})::int`,
        totalCost:   sql<number>`sum(${aiTokenUsage.costUsd})::float`,
        callCount:   sql<number>`count(*)::int`,
      })
      .from(aiTokenUsage)
      .where(gte(aiTokenUsage.createdAt, since))
      .groupBy(aiTokenUsage.userId)
      .orderBy(desc(sql`sum(${aiTokenUsage.totalTokens})`))
      .limit(limit)
      .offset(offset);
  },

  async getTokenUsageForUser(userId: string, period = 'month') {
    const since = periodStart(period);

    const rows = await db
      .select({
        feature:     aiTokenUsage.feature,
        totalTokens: sql<number>`sum(${aiTokenUsage.totalTokens})::int`,
        totalCost:   sql<number>`sum(${aiTokenUsage.costUsd})::float`,
        day:         sql<string>`date_trunc('day', ${aiTokenUsage.createdAt})::text`,
      })
      .from(aiTokenUsage)
      .where(and(eq(aiTokenUsage.userId, userId), gte(aiTokenUsage.createdAt, since)))
      .groupBy(aiTokenUsage.feature, sql`date_trunc('day', ${aiTokenUsage.createdAt})`);

    return rows;
  },

  // Model-wise aggregated usage
  async getTokenUsageByModel(period = 'month') {
    const since = periodStart(period);

    const rows = await db
      .select({
        modelName:   aiTokenUsage.modelName,
        feature:     aiTokenUsage.feature,
        totalTokens: sql<number>`sum(${aiTokenUsage.totalTokens})::int`,
        inputTokens: sql<number>`sum(${aiTokenUsage.inputTokens})::int`,
        outputTokens:sql<number>`sum(${aiTokenUsage.outputTokens})::int`,
        totalCost:   sql<number>`sum(${aiTokenUsage.costUsd})::float`,
        callCount:   sql<number>`count(*)::int`,
      })
      .from(aiTokenUsage)
      .where(gte(aiTokenUsage.createdAt, since))
      .groupBy(aiTokenUsage.modelName, aiTokenUsage.feature)
      .orderBy(desc(sql`sum(${aiTokenUsage.totalTokens})`));

    // Group by model
    const byModel: Record<string, {
      totalTokens: number;
      inputTokens: number;
      outputTokens: number;
      totalCost: number;
      callCount: number;
      features: Array<{ feature: string; totalTokens: number; callCount: number; totalCost: number }>;
    }> = {};

    for (const r of rows) {
      if (!byModel[r.modelName]) {
        byModel[r.modelName] = { totalTokens: 0, inputTokens: 0, outputTokens: 0, totalCost: 0, callCount: 0, features: [] };
      }
      byModel[r.modelName].totalTokens  += r.totalTokens ?? 0;
      byModel[r.modelName].inputTokens  += r.inputTokens ?? 0;
      byModel[r.modelName].outputTokens += r.outputTokens ?? 0;
      byModel[r.modelName].totalCost    += r.totalCost ?? 0;
      byModel[r.modelName].callCount    += r.callCount ?? 0;
      byModel[r.modelName].features.push({
        feature: r.feature,
        totalTokens: r.totalTokens ?? 0,
        callCount: r.callCount ?? 0,
        totalCost: r.totalCost ?? 0,
      });
    }

    return { byModel, rows };
  },

  // Paginated raw usage logs (all sources: user + admin)
  async getTokenUsageLogs(opts: {
    period?: string;
    modelName?: string;
    userId?: string;
    feature?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const { period = 'month', modelName, userId, feature, page = 1, limit = 50 } = opts;
    const since = periodStart(period);
    const offset = (page - 1) * limit;

    const conditions = [gte(aiTokenUsage.createdAt, since)];
    if (modelName) conditions.push(eq(aiTokenUsage.modelName, modelName));
    if (userId)    conditions.push(eq(aiTokenUsage.userId, userId));
    if (feature)   conditions.push(eq(aiTokenUsage.feature, feature));

    const [logs, countRows] = await Promise.all([
      db
        .select()
        .from(aiTokenUsage)
        .where(and(...conditions))
        .orderBy(desc(aiTokenUsage.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(aiTokenUsage)
        .where(and(...conditions)),
    ]);

    return { logs, total: countRows[0]?.count ?? 0, page, limit };
  },

  // ─── Chat Log Viewer ──────────────────────────────────────────────────

  async listChatSessions(filters: {
    userId?: string;
    petId?: string;
    page?: number;
    limit?: number;
  }) {
    const { userId, petId, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (userId) conditions.push(eq(aiChatSessions.userId, userId));
    if (petId)  conditions.push(eq(aiChatSessions.petId, petId));

    return db
      .select()
      .from(aiChatSessions)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(aiChatSessions.updatedAt))
      .limit(limit)
      .offset(offset);
  },

  async getChatSessionMessages(sessionId: string) {
    return db
      .select()
      .from(aiChatMessages)
      .where(eq(aiChatMessages.sessionId, sessionId))
      .orderBy(asc(aiChatMessages.createdAt));
  },

  // ─── Model Key Management ─────────────────────────────────────────────

  async listModels() {
    const rows = await db.select().from(aiModelConfigs).orderBy(asc(aiModelConfigs.purpose));
    return rows.map((r) => {
      const key = r.apiKeyEncrypted ?? '';
      const masked = key.length > 12
        ? key.slice(0, 8) + '••••••••' + key.slice(-4)
        : '••••••••••••';
      return { ...r, apiKeyEncrypted: masked };
    });
  },

  async addModel(data: {
    provider: string;
    modelName: string;
    displayName?: string;
    apiKey: string;
    purpose: string;
    baseUrl?: string;
    notes?: string;
    maxTokensPerDay?: number;
    maxTokensPerUserDay?: number;
    costPer1kInput?: number;
    costPer1kOutput?: number;
    createdBy: string;
  }) {
    // Validate + normalize the provider (subscription-proxy aliases → *_custom,
    // enforce base URL where required) before persisting.
    const normalized = validateAndNormalizeProvider({
      provider: data.provider,
      baseUrl: data.baseUrl,
    });

    const rows = await db
      .insert(aiModelConfigs)
      .values({
        provider: normalized.provider,
        modelName: data.modelName,
        displayName: data.displayName ?? null,
        apiKeyEncrypted: data.apiKey,
        purpose: data.purpose,
        baseUrl: normalized.baseUrl,
        notes: data.notes ?? null,
        isActive: false,
        maxTokensPerDay: data.maxTokensPerDay ?? null,
        maxTokensPerUserDay: data.maxTokensPerUserDay ?? null,
        costPer1kInput: data.costPer1kInput?.toString() ?? null,
        costPer1kOutput: data.costPer1kOutput?.toString() ?? null,
        createdBy: data.createdBy,
      })
      .returning();

    invalidateModelCache();
    const r = rows[0];
    const key = r.apiKeyEncrypted ?? '';
    return {
      ...r,
      apiKeyEncrypted: key.length > 12 ? key.slice(0, 8) + '••••••••' + key.slice(-4) : '••••••••••••',
    };
  },

  async activateModel(modelId: string) {
    // Get model's own purpose from DB
    const existing = await db
      .select({ purpose: aiModelConfigs.purpose })
      .from(aiModelConfigs)
      .where(eq(aiModelConfigs.id, modelId))
      .limit(1);

    if (existing.length === 0) throw new Error('Model not found');

    const purpose = existing[0].purpose;

    // Deactivate all models with same purpose
    await db
      .update(aiModelConfigs)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(aiModelConfigs.purpose, purpose));

    // Activate this model
    await db
      .update(aiModelConfigs)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(aiModelConfigs.id, modelId));

    invalidateModelCache();
    return { success: true, modelId, purpose };
  },

  async deleteModel(modelId: string) {
    await db.delete(aiModelConfigs).where(eq(aiModelConfigs.id, modelId));
    invalidateModelCache();
    return { success: true };
  },

  async updateModel(modelId: string, data: {
    provider?: string;
    modelName?: string;
    displayName?: string;
    apiKey?: string;
    purpose?: string;
    baseUrl?: string;
    notes?: string;
    maxTokensPerDay?: number;
    maxTokensPerUserDay?: number;
    costPer1kInput?: number;
    costPer1kOutput?: number;
  }) {
    const updates: Record<string, any> = { updatedAt: new Date() };

    // If the provider is being changed, validate + normalize it. Base URL may
    // come in this same update or already be stored — fall back to the stored
    // value so we don't reject a valid *_custom row that keeps its old URL.
    if (data.provider !== undefined) {
      let baseUrlForCheck: string | null | undefined = data.baseUrl;
      if (baseUrlForCheck === undefined) {
        const [existing] = await db
          .select({ baseUrl: aiModelConfigs.baseUrl })
          .from(aiModelConfigs)
          .where(eq(aiModelConfigs.id, modelId))
          .limit(1);
        baseUrlForCheck = existing?.baseUrl ?? null;
      }
      const normalized = validateAndNormalizeProvider({
        provider: data.provider,
        baseUrl: baseUrlForCheck,
      });
      updates.provider = normalized.provider;
      updates.baseUrl = normalized.baseUrl;
    }

    if (data.modelName !== undefined) updates.modelName = data.modelName;
    if (data.displayName !== undefined) updates.displayName = data.displayName;
    if (data.apiKey !== undefined && data.apiKey.trim() !== '') updates.apiKeyEncrypted = data.apiKey;
    if (data.purpose !== undefined) updates.purpose = data.purpose;
    // Only apply a standalone baseUrl update when the provider isn't also
    // changing (that path already set baseUrl via normalization above).
    if (data.baseUrl !== undefined && data.provider === undefined) updates.baseUrl = data.baseUrl || null;
    if (data.notes !== undefined) updates.notes = data.notes || null;
    if (data.maxTokensPerDay !== undefined) updates.maxTokensPerDay = data.maxTokensPerDay || null;
    if (data.maxTokensPerUserDay !== undefined) updates.maxTokensPerUserDay = data.maxTokensPerUserDay || null;
    if (data.costPer1kInput !== undefined) updates.costPer1kInput = data.costPer1kInput?.toString() ?? null;
    if (data.costPer1kOutput !== undefined) updates.costPer1kOutput = data.costPer1kOutput?.toString() ?? null;

    const rows = await db
      .update(aiModelConfigs)
      .set(updates)
      .where(eq(aiModelConfigs.id, modelId))
      .returning();

    if (rows.length === 0) throw new Error('Model not found');
    invalidateModelCache();
    const r = rows[0];
    const key = r.apiKeyEncrypted ?? '';
    return {
      ...r,
      apiKeyEncrypted: key.length > 12 ? key.slice(0, 8) + '••••••••' + key.slice(-4) : '••••••••••••',
    };
  },

  // ─── Admin AI Instructions ────────────────────────────────────────────

  async listInstructions(targetType?: string, targetId?: string) {
    const conditions = [];
    if (targetType) conditions.push(eq(adminAiInstructions.targetType, targetType));
    if (targetId)   conditions.push(eq(adminAiInstructions.targetId, targetId));

    return db
      .select()
      .from(adminAiInstructions)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(adminAiInstructions.priority), desc(adminAiInstructions.createdAt));
  },

  async createInstruction(data: {
    targetType: string;
    targetId?: string;
    instruction: string;
    reason?: string;
    priority?: number;
    expiresAt?: string;
    createdBy: string;
  }) {
    const rows = await db
      .insert(adminAiInstructions)
      .values({
        targetType: data.targetType,
        targetId: data.targetId ?? null,
        instruction: data.instruction,
        reason: data.reason,
        priority: data.priority ?? 0,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        createdBy: data.createdBy,
        isActive: true,
      })
      .returning();
    return rows[0];
  },

  async updateInstruction(id: string, data: { instruction?: string; reason?: string; priority?: number; isActive?: boolean }) {
    await db
      .update(adminAiInstructions)
      .set(data)
      .where(eq(adminAiInstructions.id, id));
  },

  async deleteInstruction(id: string) {
    await db.delete(adminAiInstructions).where(eq(adminAiInstructions.id, id));
  },

  // ─── Per-User & Per-Pet Status ────────────────────────────────────────

  async getUserAiStatus(userId: string) {
    const userPets = await db.select().from(pets).where(eq(pets.userId, userId));

    const petStatuses = [];
    for (const pet of userPets) {
      const plan = await db
        .select({ id: petCarePlans.id, generatedAt: petCarePlans.generatedAt, version: petCarePlans.version })
        .from(petCarePlans)
        .where(and(eq(petCarePlans.petId, pet.id), eq(petCarePlans.isActive, true)))
        .limit(1);

      const sessionCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(aiChatSessions)
        .where(eq(aiChatSessions.userId, userId))
        .limit(1);

      petStatuses.push({
        petId: pet.id,
        petName: pet.name,
        petType: pet.type,
        petBreed: pet.breed,
        hasActivePlan: plan.length > 0,
        planVersion: plan[0]?.version ?? null,
        planGeneratedAt: plan[0]?.generatedAt ?? null,
        totalAiSessions: sessionCount[0]?.count ?? 0,
      });
    }

    return { userId, pets: petStatuses };
  },

  // ─── Platform Summary (for Admin AI assistant) ────────────────────────

  async getPlatformSummary() {
    const [userCount] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    const [petCount]  = await db.select({ count: sql<number>`count(*)::int` }).from(pets);
    const [sessionCount] = await db.select({ count: sql<number>`count(*)::int` }).from(aiChatSessions);

    const todayStart = periodStart('day');
    const [tokenToday] = await db
      .select({
        tokens: sql<number>`coalesce(sum(${aiTokenUsage.totalTokens}), 0)::int`,
        cost:   sql<number>`coalesce(sum(${aiTokenUsage.costUsd}), 0)::float`,
        calls:  sql<number>`count(*)::int`,
      })
      .from(aiTokenUsage)
      .where(gte(aiTokenUsage.createdAt, todayStart));

    return {
      totalUsers:     userCount?.count ?? 0,
      totalPets:      petCount?.count ?? 0,
      totalAiSessions: sessionCount?.count ?? 0,
      tokensToday:    tokenToday?.tokens ?? 0,
      costToday:      tokenToday?.cost ?? 0,
      aiCallsToday:   tokenToday?.calls ?? 0,
    };
  },

  // ─── User Token Limits ────────────────────────────────────────────────

  async listUserTokenLimits(page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    return db
      .select()
      .from(userAiTokenLimits)
      .orderBy(desc(userAiTokenLimits.tokensToday))
      .limit(limit)
      .offset(offset);
  },

  async getUserTokenLimit(userId: string) {
    const rows = await db
      .select()
      .from(userAiTokenLimits)
      .where(eq(userAiTokenLimits.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  },

  async setUserTokenLimit(adminId: string, data: {
    userId: string;
    dailyLimit?: number | null;
    monthlyLimit?: number | null;
    isBlocked?: boolean;
    blockReason?: string | null;
  }) {
    const existing = await db
      .select({ id: userAiTokenLimits.id })
      .from(userAiTokenLimits)
      .where(eq(userAiTokenLimits.userId, data.userId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(userAiTokenLimits)
        .set({
          dailyLimit: data.dailyLimit,
          monthlyLimit: data.monthlyLimit,
          isBlocked: data.isBlocked ?? false,
          blockReason: data.blockReason ?? null,
          createdBy: adminId,
          updatedAt: new Date(),
        })
        .where(eq(userAiTokenLimits.userId, data.userId));
    } else {
      await db.insert(userAiTokenLimits).values({
        userId: data.userId,
        dailyLimit: data.dailyLimit,
        monthlyLimit: data.monthlyLimit,
        isBlocked: data.isBlocked ?? false,
        blockReason: data.blockReason ?? null,
        createdBy: adminId,
      });
    }
    return { success: true };
  },

  async removeUserTokenLimit(userId: string) {
    await db.delete(userAiTokenLimits).where(eq(userAiTokenLimits.userId, userId));
    return { success: true };
  },

  async blockUser(adminId: string, userId: string, reason: string) {
    return AdminAiService.setUserTokenLimit(adminId, { userId, isBlocked: true, blockReason: reason });
  },

  async unblockUser(adminId: string, userId: string) {
    return AdminAiService.setUserTokenLimit(adminId, { userId, isBlocked: false, blockReason: null });
  },

  // ─── Enhanced Model Management ────────────────────────────────────────

  async listModelsByPurpose() {
    const rows = await db
      .select()
      .from(aiModelConfigs)
      .orderBy(asc(aiModelConfigs.purpose), desc(aiModelConfigs.isActive));

    return rows.map((r) => ({
      ...r,
      apiKeyEncrypted: r.apiKeyEncrypted.length > 12
        ? r.apiKeyEncrypted.slice(0, 8) + '••••••••••••' + r.apiKeyEncrypted.slice(-4)
        : '••••••••',
    }));
  },

  async updateModelPurpose(modelId: string, purpose: string) {
    await db
      .update(aiModelConfigs)
      .set({ purpose, updatedAt: new Date() })
      .where(eq(aiModelConfigs.id, modelId));
    invalidateModelCache();
  },

  async updateModelLimits(modelId: string, data: {
    maxTokensPerDay?: number | null;
    maxTokensPerUserDay?: number | null;
    costPer1kInput?: number;
    costPer1kOutput?: number;
    displayName?: string;
    notes?: string;
  }) {
    await db
      .update(aiModelConfigs)
      .set({
        maxTokensPerDay: data.maxTokensPerDay,
        maxTokensPerUserDay: data.maxTokensPerUserDay,
        costPer1kInput: data.costPer1kInput?.toString(),
        costPer1kOutput: data.costPer1kOutput?.toString(),
        displayName: data.displayName,
        notes: data.notes,
        updatedAt: new Date(),
      })
      .where(eq(aiModelConfigs.id, modelId));
    invalidateModelCache();
  },

  async getModelDailyStats(modelId: string, days = 7) {
    const from = new Date();
    from.setDate(from.getDate() - days);
    // statDate is a DATE column, so compare against a plain YYYY-MM-DD.
    const since = from.toISOString().slice(0, 10);

    return db
      .select()
      .from(aiModelDailyStats)
      .where(and(
        eq(aiModelDailyStats.modelConfigId, modelId),
        gte(aiModelDailyStats.statDate, since),
      ))
      .orderBy(asc(aiModelDailyStats.statDate));
  },

  async getPurposeSummary() {
    const purposes = ['general_chat', 'vision', 'store_assistant', 'admin_assistant', 'care_plan', 'onboarding'];
    const result: Record<string, any> = {};

    for (const p of purposes) {
      const rows = await db
        .select({ id: aiModelConfigs.id, modelName: aiModelConfigs.modelName, displayName: aiModelConfigs.displayName, provider: aiModelConfigs.provider, isActive: aiModelConfigs.isActive })
        .from(aiModelConfigs)
        .where(eq(aiModelConfigs.purpose, p));
      result[p] = rows;
    }

    return result;
  },

  // ─── Model Test ───────────────────────────────────────────────────────

  async testModel(modelId: string, testMessage: string) {
    const rows = await db
      .select()
      .from(aiModelConfigs)
      .where(eq(aiModelConfigs.id, modelId))
      .limit(1);

    if (rows.length === 0) throw new Error('Model not found');

    const m = rows[0];
    const startedAt = Date.now();

    try {
      let responseText = '';
      let inputTokens = 0;
      let outputTokens = 0;

      if (m.provider === 'google') {
        const genAI = new GoogleGenerativeAI(m.apiKeyEncrypted);
        const model = genAI.getGenerativeModel({ model: m.modelName });
        const result = await model.generateContent(testMessage);
        responseText = result.response.text();
        inputTokens = result.response.usageMetadata?.promptTokenCount ?? 0;
        outputTokens = result.response.usageMetadata?.candidatesTokenCount ?? 0;

      } else if (m.provider === 'anthropic' || m.provider === 'anthropic_custom') {
        const client = new Anthropic({
          apiKey: m.apiKeyEncrypted,
          ...(m.baseUrl && { baseURL: m.baseUrl }),
        });
        const res = await client.messages.create({
          model: m.modelName,
          max_tokens: 512,
          messages: [{ role: 'user', content: testMessage }],
        });
        responseText = (res.content[0] as any).text ?? '';
        inputTokens = res.usage?.input_tokens ?? 0;
        outputTokens = res.usage?.output_tokens ?? 0;

      } else {
        // openai / deepseek / openai_custom
        const deepseekDefaultUrl = 'https://api.deepseek.com';
        const resolvedBaseUrl = m.baseUrl
          ? m.baseUrl
          : m.provider === 'deepseek' ? deepseekDefaultUrl : undefined;
        const client = new OpenAI({
          apiKey: m.apiKeyEncrypted,
          baseURL: resolvedBaseUrl,
        });
        const res = await client.chat.completions.create({
          model: m.modelName,
          messages: [{ role: 'user', content: testMessage }],
          max_tokens: 512,
        });
        responseText = res.choices[0]?.message?.content ?? '';
        inputTokens = res.usage?.prompt_tokens ?? 0;
        outputTokens = res.usage?.completion_tokens ?? 0;
      }

      return {
        success: true,
        modelId,
        modelName: m.modelName,
        provider: m.provider,
        response: responseText,
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - startedAt,
      };
    } catch (err: any) {
      return {
        success: false,
        modelId,
        modelName: m.modelName,
        provider: m.provider,
        error: err?.message ?? 'Unknown error',
        latencyMs: Date.now() - startedAt,
      };
    }
  },

  // ─── Admin Assistant Chat ─────────────────────────────────────────────

  /**
   * Single-turn admin chat using the admin_assistant model.
   * Does not persist to DB — purely stateless for admin use.
   */
  async adminChat(message: string, history: Array<{ role: 'user' | 'assistant'; content: string }> = []) {
    const rows = await db
      .select()
      .from(aiModelConfigs)
      .where(and(eq(aiModelConfigs.purpose, 'admin_assistant'), eq(aiModelConfigs.isActive, true)))
      .limit(1);

    // Fallback to env key if no DB model configured
    const m = rows[0];
    const apiKey = m?.apiKeyEncrypted ?? process.env.GOOGLE_GEMINI_API_KEY ?? '';
    const modelName = m?.modelName ?? 'gemini-1.5-pro';
    const provider = m?.provider ?? 'google';
    const baseUrl = m?.baseUrl ?? undefined;

    const systemPrompt = `You are Careleo Admin Assistant — an intelligent AI helper for the Careleo pet care platform admin panel.
You help admins:
- Understand platform analytics and user data
- Configure AI models, token limits, and system instructions
- Debug issues and interpret error logs
- Manage users, orders, and pet health records
- Make data-driven decisions

Always respond concisely, professionally, and helpfully. Format responses with markdown when it aids clarity.`;

    const startedAt = Date.now();
    let responseText = '';
    let inputTokens = 0;
    let outputTokens = 0;

    if (provider === 'anthropic' || provider === 'anthropic_custom') {
      const client = new Anthropic({ apiKey, ...(baseUrl && { baseURL: baseUrl }) });
      const msgs: Anthropic.MessageParam[] = [
        ...history.map(h => ({ role: h.role, content: h.content })),
        { role: 'user', content: message },
      ];
      const res = await client.messages.create({
        model: modelName, max_tokens: 2048, system: systemPrompt, messages: msgs,
      });
      responseText = (res.content[0] as any).text ?? '';
      inputTokens = res.usage?.input_tokens ?? 0;
      outputTokens = res.usage?.output_tokens ?? 0;

    } else if (provider === 'openai' || provider === 'deepseek' || provider === 'openai_custom') {
      const resolvedBaseUrl = baseUrl
        ? baseUrl
        : provider === 'deepseek' ? 'https://api.deepseek.com' : undefined;
      const client = new OpenAI({ apiKey, baseURL: resolvedBaseUrl });
      const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...history.map(h => ({ role: h.role, content: h.content })),
        { role: 'user', content: message },
      ];
      const res = await client.chat.completions.create({
        model: modelName, max_tokens: 2048, messages: msgs,
      });
      responseText = res.choices[0]?.message?.content ?? '';
      inputTokens = res.usage?.prompt_tokens ?? 0;
      outputTokens = res.usage?.completion_tokens ?? 0;

    } else {
      // Google Gemini (default)
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: systemPrompt });
      const chat = model.startChat({
        history: history.map(h => ({
          role: h.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: h.content }],
        })),
      });
      const result = await chat.sendMessage(message);
      responseText = result.response.text();
      inputTokens = result.response.usageMetadata?.promptTokenCount ?? 0;
      outputTokens = result.response.usageMetadata?.candidatesTokenCount ?? 0;
    }

    return {
      response: responseText,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - startedAt,
      model: modelName,
      provider,
    };
  },
};
