/**
 * Daily Check-in Job — runs hourly.
 *
 * For each eligible user (has a pet, is entitled to `ai_chat`, and has not been
 * checked in within the last 24h), if the current hour matches the user's
 * preferred hour (the most common hour-of-day they chat), the AI proactively
 * sends ONE personalized "how is your pet?" message into their chat session and
 * a push notification. The user's reply flows through normal chat, where Phase
 * 2's background fact extractor learns from it.
 */

import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import { pets } from '@/shared/db/schema';
import { aiChatSessions, aiChatMessages, aiProactiveMessages } from '@/shared/db/schema/ai.schema';
import { can } from '@/modules/subscriptions/entitlements';
import { AiService } from '@/modules/ai/service';
import { NotificationsService } from '@/modules/notifications/service';

const DEFAULT_HOUR = 9;
const MAX_PER_RUN = 100;

export type DailyCheckinOptions = {
  /** Override the "current hour" check (testing). */
  forceHour?: number;
  /** Restrict to a single user (testing). */
  onlyUserId?: string;
  /** Skip the hour match entirely and check in now (testing). */
  ignoreHour?: boolean;
};

export async function runDailyCheckinJob(opts: DailyCheckinOptions = {}) {
  const now = new Date();
  const currentHour = opts.forceHour ?? now.getHours();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Distinct users that own at least one pet.
  let ownerRows = await db
    .selectDistinct({ userId: pets.userId })
    .from(pets);
  if (opts.onlyUserId) ownerRows = ownerRows.filter((r) => r.userId === opts.onlyUserId);

  let checkedIn = 0;
  let skippedEntitlement = 0;
  let consideredButOffHour = 0;

  for (const { userId } of ownerRows) {
    if (checkedIn >= MAX_PER_RUN) {
      console.log(`[daily-checkin] hit per-run cap (${MAX_PER_RUN}); remaining users deferred to next run`);
      break;
    }

    // Eligibility: ai_chat must be in the user's plan.
    if (!(await can(userId, 'ai_chat'))) {
      skippedEntitlement++;
      continue;
    }

    // 1/day cap: skip if a daily_checkin was created in the last 24h.
    const [recent] = await db
      .select({ id: aiProactiveMessages.id })
      .from(aiProactiveMessages)
      .where(
        and(
          eq(aiProactiveMessages.userId, userId),
          eq(aiProactiveMessages.messageType, 'daily_checkin'),
          gte(aiProactiveMessages.createdAt, dayAgo),
        ),
      )
      .limit(1);
    if (recent) continue;

    // Smart timing: only fire on the user's preferred hour.
    if (!opts.ignoreHour) {
      const preferredHour = await getPreferredHour(userId);
      if (preferredHour !== currentHour) {
        consideredButOffHour++;
        continue;
      }
    }

    // Pick the user's primary (first) pet for context.
    const [pet] = await db
      .select({ id: pets.id, name: pets.name })
      .from(pets)
      .where(eq(pets.userId, userId))
      .orderBy(pets.createdAt)
      .limit(1);
    if (!pet) continue;

    const message = await AiService.generateProactiveCheckin(userId, pet.id, pet.name);

    // Write into the user's chat session as a proactive assistant message.
    const session = await getOrCreateCheckinSession(userId, pet.id);
    await db.insert(aiChatMessages).values({
      sessionId: session.id,
      role: 'assistant',
      content: message,
      isProactive: true,
    });
    await db.update(aiChatSessions).set({ updatedAt: now }).where(eq(aiChatSessions.id, session.id));

    // Record the proactive message (drives the 1/day cap + analytics).
    await db.insert(aiProactiveMessages).values({
      userId,
      petId: pet.id,
      messageType: 'daily_checkin',
      chatSentAt: now,
      pushSentAt: now,
    });

    // Best-effort push; never let a push failure abort the run.
    try {
      await NotificationsService.sendToUsers(
        [userId],
        { title: 'Careleo', body: message, type: 'AI_ASSISTANT' },
        { targetMode: 'single' },
      );
    } catch (e: any) {
      console.warn('[daily-checkin] push failed for user', userId, e?.message ?? e);
    }

    checkedIn++;
  }

  return { checkedIn, skippedEntitlement, consideredButOffHour, owners: ownerRows.length };
}

/** Most common hour-of-day the user sends chat messages; DEFAULT_HOUR if none. */
async function getPreferredHour(userId: string): Promise<number> {
  const rows = await db
    .select({
      hour: sql<number>`EXTRACT(HOUR FROM ${aiChatMessages.createdAt})::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(aiChatMessages)
    .innerJoin(aiChatSessions, eq(aiChatMessages.sessionId, aiChatSessions.id))
    .where(and(eq(aiChatSessions.userId, userId), eq(aiChatMessages.role, 'user')))
    .groupBy(sql`EXTRACT(HOUR FROM ${aiChatMessages.createdAt})`)
    .orderBy(sql`count(*) DESC`)
    .limit(1);
  return rows[0]?.hour ?? DEFAULT_HOUR;
}

/** Reuse the user's most recent non-admin session, or create one. */
async function getOrCreateCheckinSession(userId: string, petId: string) {
  const existing = await db
    .select({ id: aiChatSessions.id })
    .from(aiChatSessions)
    .where(and(eq(aiChatSessions.userId, userId), eq(aiChatSessions.isAdminSession, false)))
    .orderBy(sql`${aiChatSessions.updatedAt} DESC`)
    .limit(1);
  if (existing[0]) return existing[0];

  const rows = await db
    .insert(aiChatSessions)
    .values({ userId, petId, title: 'Careleo AI', isAdminSession: false })
    .returning({ id: aiChatSessions.id });
  return rows[0]!;
}
