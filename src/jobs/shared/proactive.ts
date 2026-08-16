/**
 * One way to say something to a pet owner without being asked.
 *
 * Every proactive job wants the same four things: put the message in the chat
 * where a reply is possible, bump the session so it surfaces, record that it
 * happened (for caps and analytics), and send a push that respects the user's
 * preferences. Doing that by hand in each job is how they drifted apart — one
 * wrote to the oldest session, one forgot the push entirely.
 */

import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '@/shared/db';
import { aiChatMessages, aiChatSessions, aiProactiveMessages } from '@/shared/db/schema/ai.schema';
import { deliverToUser, type DeliveryResult } from '@/modules/notifications/deliver';
import type { NotificationPriority } from '@/modules/notifications/preferences';

/** The user's most recent session — the one the app opens — or a new one. */
export const getOrCreateSession = async (userId: string, petId?: string | null) => {
  const existing = await db
    .select({ id: aiChatSessions.id })
    .from(aiChatSessions)
    .where(and(eq(aiChatSessions.userId, userId), eq(aiChatSessions.isAdminSession, false)))
    .orderBy(desc(aiChatSessions.updatedAt))
    .limit(1);

  if (existing[0]) return existing[0];

  const rows = await db
    .insert(aiChatSessions)
    .values({ userId, petId: petId ?? undefined, title: 'Careleo AI', isAdminSession: false })
    .returning({ id: aiChatSessions.id });

  return rows[0]!;
};

/**
 * Has this kind of message already gone out recently?
 *
 * The guard that keeps a weekly review weekly and a check-in daily, even when
 * the job that sends it ticks every hour.
 */
export const sentWithin = async (userId: string, messageType: string, since: Date): Promise<boolean> => {
  const [row] = await db
    .select({ id: aiProactiveMessages.id })
    .from(aiProactiveMessages)
    .where(
      and(
        eq(aiProactiveMessages.userId, userId),
        eq(aiProactiveMessages.messageType, messageType),
        gte(aiProactiveMessages.createdAt, since),
      ),
    )
    .limit(1);
  return Boolean(row);
};

export type ProactiveSend = {
  userId: string;
  petId?: string | null;
  /** Goes into `ai_proactive_messages.message_type`; drives the per-kind caps. */
  messageType: string;
  /** The chat message. Also the push body unless `pushBody` is given. */
  message: string;
  pushTitle?: string;
  pushBody?: string;
  /** Notification type — decides the category the user can switch off. */
  type?: string;
  priority?: NotificationPriority;
  data?: Record<string, string>;
};

export const sendProactive = async (opts: ProactiveSend): Promise<DeliveryResult | null> => {
  const now = new Date();
  const session = await getOrCreateSession(opts.userId, opts.petId);

  await db.insert(aiChatMessages).values({
    sessionId: session.id,
    role: 'assistant',
    content: opts.message,
    isProactive: true,
  });
  await db.update(aiChatSessions).set({ updatedAt: now }).where(eq(aiChatSessions.id, session.id));

  await db.insert(aiProactiveMessages).values({
    userId: opts.userId,
    petId: opts.petId ?? null,
    messageType: opts.messageType,
    chatSentAt: now,
    pushSentAt: now,
  });

  try {
    return await deliverToUser(opts.userId, {
      title: opts.pushTitle ?? 'Careleo',
      body: opts.pushBody ?? opts.message,
      type: opts.type ?? 'AI_ASSISTANT',
      priority: opts.priority ?? 'low',
      data: { sessionId: session.id, ...(opts.data ?? {}) },
    });
  } catch (e: any) {
    // The chat message is already saved; a failed push is not worth losing it.
    console.warn(`[${opts.messageType}] push failed for user`, opts.userId, e?.message ?? e);
    return null;
  }
};
