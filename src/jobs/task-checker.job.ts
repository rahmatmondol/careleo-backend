/**
 * Task Checker Job — runs every 30 minutes.
 * Finds overdue tasks and sends push notifications.
 * Then logs to ai_proactive_messages so the nudge job can follow up.
 */

import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import { tasks } from '@/shared/db/schema';
import { aiProactiveMessages } from '@/shared/db/schema/ai.schema';
import { NotificationsService } from '@/modules/notifications/service';

const COOLDOWN_HOURS = 3; // don't re-push same task within 3 hours

export async function runTaskCheckerJob() {
  const now = new Date();
  const overdueThreshold = new Date(now);
  overdueThreshold.setMinutes(now.getMinutes() - 5); // 5 min grace period

  // Find overdue, incomplete tasks
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
    .where(
      and(
        eq(tasks.isCompleted, false),
        lt(tasks.dueDate, overdueThreshold),
      ),
    )
    .limit(200);

  if (overdueTasks.length === 0) return { checked: 0, notified: 0 };

  // Cooldown: skip tasks that already got a push in the last COOLDOWN_HOURS
  const cooldownSince = new Date(now.getTime() - COOLDOWN_HOURS * 60 * 60 * 1000);

  const recentLogs = await db
    .select({ taskId: aiProactiveMessages.taskId })
    .from(aiProactiveMessages)
    .where(
      and(
        eq(aiProactiveMessages.messageType, 'task_overdue'),
        sql`${aiProactiveMessages.pushSentAt} > ${cooldownSince.toISOString()}`,
        isNull(aiProactiveMessages.actionTakenAt),
      ),
    );

  const alreadyPushed = new Set(recentLogs.map((r) => r.taskId));

  let notified = 0;
  for (const task of overdueTasks) {
    if (alreadyPushed.has(task.id)) continue;

    // Send push notification
    try {
      await NotificationsService.sendToUsers(
        [task.userId],
        {
          title: `⏰ Overdue task`,
          body: `${task.title} was due and hasn't been completed yet`,
          type: 'TASK_OVERDUE',
          data: { taskId: task.id, petId: task.petId },
        },
        { targetMode: 'single' },
      );

      // Log to proactive messages table
      await db.insert(aiProactiveMessages).values({
        userId: task.userId,
        petId: task.petId ?? null,
        taskId: task.id,
        messageType: 'task_overdue',
        pushSentAt: now,
      });

      notified++;
    } catch {
      // Continue to next task if one fails
    }
  }

  return { checked: overdueTasks.length, notified };
}
