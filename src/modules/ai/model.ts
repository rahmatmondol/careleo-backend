import { and, desc, eq, gte, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import {
  aiChatMessages,
  aiChatSessions,
  aiProactiveMessages,
  aiTokenUsage,
  adminAiInstructions,
  petCarePlans,
} from '@/shared/db/schema';
import { pets, petPreferences } from '@/shared/db/schema';

export const AiModel = {
  async ping() {
    return { module: 'ai', ok: true };
  },

  // ─── Chat Sessions ────────────────────────────────────────────────────────

  async createSession(userId: string, petId?: string, title?: string) {
    const rows = await db
      .insert(aiChatSessions)
      .values({ userId, petId: petId ?? null, title: title ?? 'New Chat' })
      .returning();
    return rows[0] ?? null;
  },

  async listSessions(userId: string) {
    return db
      .select()
      .from(aiChatSessions)
      .where(and(eq(aiChatSessions.userId, userId), eq(aiChatSessions.isAdminSession, false)))
      .orderBy(desc(aiChatSessions.updatedAt))
      .limit(50);
  },

  async getSession(userId: string, sessionId: string) {
    const rows = await db
      .select()
      .from(aiChatSessions)
      .where(and(eq(aiChatSessions.id, sessionId), eq(aiChatSessions.userId, userId)));
    return rows[0] ?? null;
  },

  async deleteSession(userId: string, sessionId: string) {
    await db
      .delete(aiChatSessions)
      .where(and(eq(aiChatSessions.id, sessionId), eq(aiChatSessions.userId, userId)));
  },

  async updateSessionTitle(sessionId: string, title: string) {
    await db
      .update(aiChatSessions)
      .set({ title, updatedAt: new Date() })
      .where(eq(aiChatSessions.id, sessionId));
  },

  // ─── Messages ─────────────────────────────────────────────────────────────

  /** Persist a rolling conversation summary and how far it covers. */
  async updateSessionSummary(sessionId: string, summary: string, summarizedUpTo: number) {
    await db
      .update(aiChatSessions)
      .set({ summary, summarizedUpTo, updatedAt: new Date() })
      .where(eq(aiChatSessions.id, sessionId));
  },

  async getMessages(sessionId: string) {
    return db
      .select()
      .from(aiChatMessages)
      .where(eq(aiChatMessages.sessionId, sessionId))
      .orderBy(aiChatMessages.createdAt);
  },

  async saveMessage(payload: {
    sessionId: string;
    role: string;
    content?: string;
    toolCallsJson?: string;
    toolResultsJson?: string;
    inputTokens?: number;
    outputTokens?: number;
    isProactive?: boolean;
  }) {
    const rows = await db
      .insert(aiChatMessages)
      .values({
        sessionId: payload.sessionId,
        role: payload.role,
        content: payload.content,
        toolCallsJson: payload.toolCallsJson,
        toolResultsJson: payload.toolResultsJson,
        inputTokens: payload.inputTokens ?? 0,
        outputTokens: payload.outputTokens ?? 0,
        isProactive: payload.isProactive ?? false,
      })
      .returning();
    return rows[0] ?? null;
  },

  // ─── Token Usage ──────────────────────────────────────────────────────────

  async logTokenUsage(payload: {
    userId: string;
    petId?: string;
    sessionId?: string;
    modelName: string;
    feature: string;
    inputTokens: number;
    outputTokens: number;
    costUsd?: number;
  }) {
    const total = payload.inputTokens + payload.outputTokens;
    await db.insert(aiTokenUsage).values({
      userId: payload.userId,
      petId: payload.petId ?? null,
      sessionId: payload.sessionId ?? null,
      modelName: payload.modelName,
      feature: payload.feature,
      inputTokens: payload.inputTokens,
      outputTokens: payload.outputTokens,
      totalTokens: total,
      costUsd: String(payload.costUsd ?? 0),
    });
  },

  // ─── Care Plans ───────────────────────────────────────────────────────────

  async savePetCarePlan(petId: string, planJson: string, generatedBy: string) {
    // Deactivate existing plans first
    await db
      .update(petCarePlans)
      .set({ isActive: false })
      .where(eq(petCarePlans.petId, petId));

    // Get latest version number
    const existing = await db
      .select({ version: petCarePlans.version })
      .from(petCarePlans)
      .where(eq(petCarePlans.petId, petId))
      .orderBy(desc(petCarePlans.version))
      .limit(1);

    const nextVersion = (existing[0]?.version ?? 0) + 1;

    const rows = await db
      .insert(petCarePlans)
      .values({ petId, planJson, generatedBy, version: nextVersion, isActive: true })
      .returning();
    return rows[0] ?? null;
  },

  async getActivePetCarePlan(petId: string) {
    const rows = await db
      .select()
      .from(petCarePlans)
      .where(and(eq(petCarePlans.petId, petId), eq(petCarePlans.isActive, true)))
      .orderBy(desc(petCarePlans.generatedAt))
      .limit(1);
    return rows[0] ?? null;
  },

  // ─── Pet Context (for system prompt injection) ───────────────────────────

  async getPetWithPreferences(petId: string) {
    const petRows = await db.select().from(pets).where(eq(pets.id, petId));
    const pet = petRows[0];
    if (!pet) return null;

    const prefRows = await db
      .select()
      .from(petPreferences)
      .where(eq(petPreferences.petId, petId))
      .limit(1);
    const prefs = prefRows[0] ?? null;

    return { pet, prefs };
  },

  async getUserPets(userId: string) {
    return db.select().from(pets).where(eq(pets.userId, userId));
  },

  // ─── Admin Instructions ───────────────────────────────────────────────────

  async getActiveInstructions(userId: string, petId?: string) {
    const now = new Date();

    const conditions = [
      eq(adminAiInstructions.isActive, true),
      or(
        isNull(adminAiInstructions.expiresAt),
        gte(adminAiInstructions.expiresAt, now),
      ),
      or(
        eq(adminAiInstructions.targetType, 'global'),
        and(eq(adminAiInstructions.targetType, 'user'), eq(adminAiInstructions.targetId, userId)),
        petId
          ? and(eq(adminAiInstructions.targetType, 'pet'), eq(adminAiInstructions.targetId, petId))
          : sql`false`,
      ),
    ];

    return db
      .select()
      .from(adminAiInstructions)
      .where(and(...conditions))
      .orderBy(desc(adminAiInstructions.priority));
  },

  // ─── Proactive Messages ───────────────────────────────────────────────────

  async createProactiveMessage(payload: {
    userId: string;
    petId?: string;
    taskId?: string;
    messageType: string;
  }) {
    const rows = await db
      .insert(aiProactiveMessages)
      .values({
        userId: payload.userId,
        petId: payload.petId ?? null,
        taskId: payload.taskId ?? null,
        messageType: payload.messageType,
        pushSentAt: new Date(),
      })
      .returning();
    return rows[0] ?? null;
  },

  async markProactiveChatSent(id: string) {
    await db
      .update(aiProactiveMessages)
      .set({ chatSentAt: new Date() })
      .where(eq(aiProactiveMessages.id, id));
  },

  async markProactiveActionTaken(id: string) {
    await db
      .update(aiProactiveMessages)
      .set({ actionTakenAt: new Date() })
      .where(eq(aiProactiveMessages.id, id));
  },
};
