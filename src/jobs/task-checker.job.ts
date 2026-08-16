/**
 * Task Checker Job — runs every 30 minutes.
 *
 * This job used to push. It doesn't any more: the notification queue owns the
 * push ladder (bundled at due time, then at most `taskEscalationLimit`
 * follow-ups), and a job that re-pushed every overdue task every three hours,
 * forever, was the single biggest source of notification fatigue in the app.
 *
 * What it does now is the handoff. Once a task has outlived the push ladder and
 * is still open, it is registered **once, ever** in `ai_proactive_messages`, and
 * the AI nudge job picks it up and continues the conversation in chat — where
 * the user can actually explain what happened.
 */

import { and, eq, inArray, isNotNull, isNull, lt } from 'drizzle-orm';
import { db } from '@/shared/db';
import { tasks } from '@/shared/db/schema';
import { aiProactiveMessages } from '@/shared/db/schema/ai.schema';

/** How long after the due time the push ladder is considered exhausted. */
const HANDOFF_AFTER_HOURS = 2;

const MAX_PER_RUN = 200;

export async function runTaskCheckerJob() {
  const now = new Date();
  const handoffThreshold = new Date(now.getTime() - HANDOFF_AFTER_HOURS * 60 * 60 * 1000);

  const overdueTasks = await db
    .select({
      id: tasks.id,
      userId: tasks.userId,
      petId: tasks.petId,
      title: tasks.title,
      taskType: tasks.taskType,
      dueDate: tasks.dueDate,
    })
    .from(tasks)
    .where(and(eq(tasks.isCompleted, false), isNull(tasks.skippedAt), lt(tasks.dueDate, handoffThreshold)))
    .limit(MAX_PER_RUN);

  if (overdueTasks.length === 0) return { checked: 0, handedOff: 0 };

  // One handoff per task for its whole lifetime — no cooldown to expire, so a
  // task that stays open for a week still only produces a single nudge.
  const seen = await db
    .select({ taskId: aiProactiveMessages.taskId })
    .from(aiProactiveMessages)
    .where(
      and(
        eq(aiProactiveMessages.messageType, 'task_overdue'),
        isNotNull(aiProactiveMessages.taskId),
        inArray(
          aiProactiveMessages.taskId,
          overdueTasks.map((t) => t.id),
        ),
      ),
    );

  const alreadyHandled = new Set(seen.map((r) => r.taskId));
  const pending = overdueTasks.filter((t) => !alreadyHandled.has(t.id));
  if (!pending.length) return { checked: overdueTasks.length, handedOff: 0 };

  await db.insert(aiProactiveMessages).values(
    pending.map((task) => ({
      userId: task.userId,
      petId: task.petId ?? null,
      taskId: task.id,
      messageType: 'task_overdue',
      // pushSentAt stays null on purpose: the push already happened (or was
      // suppressed by the user's preferences) in the queue, not here.
    })),
  );

  return { checked: overdueTasks.length, handedOff: pending.length };
}
