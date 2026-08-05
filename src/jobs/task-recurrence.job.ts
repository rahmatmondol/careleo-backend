/**
 * Task Recurrence Job — runs hourly.
 *
 * Completing a recurring task creates its next occurrence (TasksService), but
 * a missed one used to sit overdue forever and the schedule died with it. This
 * job rolls any recurring task that is more than one full period overdue to its
 * next future slot, so a daily feeding is always waiting today rather than
 * accumulating a month of guilt.
 *
 * Missed slots are skipped, not replayed — nobody wants thirty backdated
 * "feed Bella" rows after a holiday.
 */

import { TasksModel } from '@/modules/tasks/model';
import { nextOccurrenceAfter, periodMs } from '@/modules/tasks/recurrence';
import { scheduleTaskDuePush } from '@/shared/queue';

export async function runTaskRecurrenceJob() {
  const now = new Date();
  // Widest period we handle is monthly; per-task grace is checked below.
  const candidates = await TasksModel.listStaleRecurringTasks(now);

  let rolled = 0;
  for (const task of candidates) {
    const period = periodMs(task.frequency);
    if (!period) continue;

    const dueDate = task.dueDate instanceof Date ? task.dueDate : new Date(task.dueDate);
    // Give the owner one full period to catch up before moving the task on.
    if (now.getTime() - dueDate.getTime() < period) continue;

    const nextDue = nextOccurrenceAfter(dueDate, task.frequency, now);
    if (!nextDue) continue;

    try {
      await TasksModel.rollTaskDueDate(task.id, nextDue);
      await scheduleTaskDuePush(task.id);
      rolled++;
    } catch {
      // One bad row shouldn't stop the sweep.
    }
  }

  return { checked: candidates.length, rolled };
}
