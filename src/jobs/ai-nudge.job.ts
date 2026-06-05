/**
 * AI Nudge Job — runs every 2 hours.
 * Finds tasks where push was sent 2+ hrs ago but still incomplete.
 * Sends an in-app AI chat message as a proactive follow-up.
 */

import { and, eq, isNull, lt } from 'drizzle-orm';
import { db } from '@/shared/db';
import { tasks } from '@/shared/db/schema';
import { aiChatSessions, aiChatMessages, aiProactiveMessages } from '@/shared/db/schema/ai.schema';

const NUDGE_DELAY_HOURS = 2;

export async function runAiNudgeJob() {
  const now = new Date();
  const nudgeThreshold = new Date(now.getTime() - NUDGE_DELAY_HOURS * 60 * 60 * 1000);

  // Find proactive logs where push was sent but no chat sent yet, no action taken
  const pendingNudges = await db
    .select({
      id: aiProactiveMessages.id,
      userId: aiProactiveMessages.userId,
      petId: aiProactiveMessages.petId,
      taskId: aiProactiveMessages.taskId,
      pushSentAt: aiProactiveMessages.pushSentAt,
    })
    .from(aiProactiveMessages)
    .where(
      and(
        eq(aiProactiveMessages.messageType, 'task_overdue'),
        isNull(aiProactiveMessages.chatSentAt),
        isNull(aiProactiveMessages.actionTakenAt),
        lt(aiProactiveMessages.pushSentAt, nudgeThreshold),
      ),
    )
    .limit(50);

  if (pendingNudges.length === 0) return { nudged: 0 };

  let nudged = 0;
  for (const nudge of pendingNudges) {
    if (!nudge.taskId) continue;

    // Check task is still incomplete
    const taskRows = await db
      .select({ id: tasks.id, title: tasks.title, isCompleted: tasks.isCompleted })
      .from(tasks)
      .where(eq(tasks.id, nudge.taskId))
      .limit(1);

    const task = taskRows[0];
    if (!task || task.isCompleted) {
      // Task was completed — mark proactive as action taken
      await db
        .update(aiProactiveMessages)
        .set({ actionTakenAt: now })
        .where(eq(aiProactiveMessages.id, nudge.id));
      continue;
    }

    // Find or create a chat session for this user
    let session = await getOrCreateNudgeSession(nudge.userId);

    // Build a human-like proactive message
    const message = buildNudgeMessage(task.title);

    // Save the proactive AI message to the session
    await db.insert(aiChatMessages).values({
      sessionId: session.id,
      role: 'assistant',
      content: message,
      isProactive: true,
    });

    // Update the session's updatedAt so it surfaces at top
    await db
      .update(aiChatSessions)
      .set({ updatedAt: now })
      .where(eq(aiChatSessions.id, session.id));

    // Mark chat sent
    await db
      .update(aiProactiveMessages)
      .set({ chatSentAt: now })
      .where(eq(aiProactiveMessages.id, nudge.id));

    nudged++;
  }

  return { nudged };
}

async function getOrCreateNudgeSession(userId: string) {
  // Look for existing AI session for this user
  const existing = await db
    .select({ id: aiChatSessions.id })
    .from(aiChatSessions)
    .where(and(eq(aiChatSessions.userId, userId), eq(aiChatSessions.isAdminSession, false)))
    .orderBy(aiChatSessions.updatedAt)
    .limit(1);

  if (existing[0]) return existing[0];

  // Create a new session
  const rows = await db
    .insert(aiChatSessions)
    .values({ userId, title: 'Careleo AI', isAdminSession: false })
    .returning({ id: aiChatSessions.id });

  return rows[0]!;
}

function buildNudgeMessage(taskTitle: string): string {
  const templates = [
    `Hey! আমি দেখলাম "${taskTitle}" task টা এখনো complete হয়নি। তুমি কি এটা করেছ? Complete করলে mark করে দাও।`,
    `"${taskTitle}" এখনো pending আছে। সব ঠিকঠাক আছে তো? কোনো সাহায্য লাগলে জানাও।`,
    `Reminder: "${taskTitle}" task টা incomplete আছে। এটা complete হয়ে গেলে আমাকে জানাও।`,
  ];
  return templates[Math.floor(Math.random() * templates.length)]!;
}
