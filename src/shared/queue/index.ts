import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '@/shared/db';
import { pets, reminders, taskReminderLogs, tasks } from '@/shared/db/schema';
import { NotificationsService } from '@/modules/notifications/service';

const redisUrl = String(process.env.REDIS_URL ?? '').trim() || 'redis://localhost:6379';
const parsed = new URL(redisUrl);
const connection: ConnectionOptions = {
  host: parsed.hostname,
  port: parsed.port ? Number(parsed.port) : 6379,
  username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
  password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
  db: parsed.pathname && parsed.pathname !== '/' ? Number(parsed.pathname.replace('/', '')) : undefined,
};

const queueName = 'careleo-notifications';

export const notificationsQueue = new Queue(queueName, {
  connection,
  defaultJobOptions: {
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

const upsertJob = async (jobId: string, name: string, data: Record<string, unknown>, delayMs: number) => {
  const existing = await notificationsQueue.getJob(jobId);
  if (existing) {
    try {
      await existing.remove();
    } catch {}
  }
  const delay = Math.max(0, Math.floor(delayMs));
  await notificationsQueue.add(name, data, { jobId, delay });
};

const REMINDER_MINUTES = [10, 20] as const;

export const scheduleTaskDuePush = async (taskId: string) => {
  const row = await db
    .select({
      id: tasks.id,
      userId: tasks.userId,
      title: tasks.title,
      taskType: tasks.taskType,
      dueDate: tasks.dueDate,
      isCompleted: tasks.isCompleted,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  const task = row[0];
  if (!task) return;
  if (task.isCompleted) {
    const job = await notificationsQueue.getJob(`task_due-${taskId}`);
    if (job) {
      try {
        await job.remove();
      } catch {}
    }
    return;
  }

  const due = new Date(task.dueDate as any);
  const delayMs = due.getTime() - Date.now();
  await upsertJob(
    `task_due-${taskId}`,
    'task_due',
    {
      taskId: String(task.id),
      userId: String(task.userId),
      title: String(task.title),
      taskType: String(task.taskType),
      dueDate: due.toISOString(),
    },
    delayMs,
  );

  await scheduleTaskReminderJobs(task.id, due);
};

export const unscheduleTaskDuePush = async (taskId: string) => {
  const job = await notificationsQueue.getJob(`task_due-${taskId}`);
  if (job) {
    try {
      await job.remove();
    } catch {}
  }
};

const scheduleTaskReminderJobs = async (taskId: string, dueDate: Date) => {
  for (const min of REMINDER_MINUTES) {
    const jobId = `task_reminder_${min}-${taskId}`;
    const fireAt = new Date(dueDate.getTime() + min * 60_000);
    const delayMs = fireAt.getTime() - Date.now();
    if (delayMs <= 0) continue;
    await upsertJob(
      jobId,
      `task_reminder`,
      {
        taskId,
        reminderMinutes: min,
        dueDate: dueDate.toISOString(),
        fireAt: fireAt.toISOString(),
      },
      delayMs,
    );
  }
};

export const unscheduleAllTaskReminderJobs = async (taskId: string) => {
  for (const min of REMINDER_MINUTES) {
    const job = await notificationsQueue.getJob(`task_reminder_${min}-${taskId}`);
    if (job) {
      try {
        await job.remove();
      } catch {}
    }
  }
};

const handleTaskReminderJob = async (taskId: string, reminderMinutes: number, dueDate: string) => {
  if (!taskId) return;

  const rows = await db
    .select({
      id: tasks.id,
      userId: tasks.userId,
      title: tasks.title,
      taskType: tasks.taskType,
      petId: tasks.petId,
      petName: pets.name,
      isCompleted: tasks.isCompleted,
      dueDate: tasks.dueDate,
    })
    .from(tasks)
    .innerJoin(pets, eq(tasks.petId, pets.id))
    .where(eq(tasks.id, taskId))
    .limit(1);

  const t = rows[0];
  if (!t) return;
  if (t.isCompleted) return;
  if (dueDate && new Date(t.dueDate as any).toISOString() !== dueDate) return;

  const petName = String(t.petName ?? '');
  const taskType = String(t.taskType ?? '').toLowerCase();
  const result = await NotificationsService.sendToUsers(
    [String(t.userId)],
    {
      title: petName ? `${petName}'s ${taskType} is overdue` : `"${String(t.title)}" is overdue`,
      body: `${reminderMinutes} minutes overdue — please complete "${String(t.title)}"`,
      data: { taskId: String(t.id), event: `task_reminder_${reminderMinutes}`, reminderMinutes: String(reminderMinutes) },
      type: `TASK_REMINDER`,
    },
    { targetMode: 'single' },
  );

  try {
    await db.insert(taskReminderLogs).values({
      taskId: String(t.id),
      userId: String(t.userId),
      reminderStep: reminderMinutes === 10 ? 1 : 2,
      stepLabel: reminderMinutes === 10 ? 'FIRST_REMINDER' : 'SECOND_REMINDER',
      taskTitle: String(t.title),
      taskType: String(t.taskType),
      taskDueDate: new Date(t.dueDate as any),
      minutesSinceDue: reminderMinutes,
      wasCompleted: false,
      pushSent: result.sent > 0,
      pushDelivered: result.sent > 0,
      pushSuccessCount: result.sent,
      pushFailureCount: result.failed,
    });
  } catch {}
};

const parseTimeToMinutes = (input: string): number | null => {
  const raw = input.trim();
  if (!raw) return null;

  const match12h = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match12h) {
    let h = Number(match12h[1]);
    const m = Number(match12h[2]);
    const meridian = match12h[3].toUpperCase();
    if (Number.isNaN(h) || Number.isNaN(m) || m < 0 || m > 59 || h < 1 || h > 12) return null;
    if (meridian === 'PM' && h !== 12) h += 12;
    if (meridian === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  }

  const match24h = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (match24h) {
    const h = Number(match24h[1]);
    const m = Number(match24h[2]);
    if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h * 60 + m;
  }

  return null;
};

const parseDateOnly = (input: string): Date | null => {
  const raw = input.trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const date = new Date(y, mo, d);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d) return null;
  return date;
};

const getFrequency = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const nextReminderOccurrence = (reminder: {
  reminderTime?: string | null;
  frequency?: string | null;
  reminderDate?: string | null;
  createdAt?: Date | null;
}, now: Date): Date | null => {
  const timeMin = parseTimeToMinutes(String(reminder.reminderTime ?? '').trim());
  if (timeMin === null) return null;
  const hour = Math.floor(timeMin / 60);
  const minute = timeMin % 60;

  const freq = getFrequency(reminder.frequency);
  const dateOnly = reminder.reminderDate ? parseDateOnly(String(reminder.reminderDate)) : null;
  const createdAt = reminder.createdAt ? new Date(reminder.createdAt) : null;

  const todayAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);

  if (freq.includes('once') || freq.includes('one')) {
    if (dateOnly) return new Date(dateOnly.getFullYear(), dateOnly.getMonth(), dateOnly.getDate(), hour, minute, 0, 0);
    return todayAt > now ? todayAt : new Date(todayAt.getTime() + 24 * 60_000 * 60);
  }

  if (freq.includes('weekly')) {
    const base = dateOnly ?? createdAt ?? now;
    const targetDow = base.getDay();
    let out = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
    const delta = (targetDow - out.getDay() + 7) % 7;
    if (delta !== 0) out.setDate(out.getDate() + delta);
    if (out <= now) out.setDate(out.getDate() + 7);
    return out;
  }

  if (freq.includes('monthly')) {
    const base = dateOnly ?? createdAt ?? now;
    const targetDom = base.getDate();
    let out = new Date(now.getFullYear(), now.getMonth(), targetDom, hour, minute, 0, 0);
    if (out <= now) out = new Date(now.getFullYear(), now.getMonth() + 1, targetDom, hour, minute, 0, 0);
    return out;
  }

  const out = todayAt > now ? todayAt : new Date(todayAt.getTime() + 24 * 60_000 * 60);
  return out;
};

export const scheduleReminderDuePush = async (reminderId: string) => {
  const rows = await db
    .select({
      id: reminders.id,
      userId: reminders.userId,
      title: reminders.title,
      reminderTime: reminders.reminderTime,
      frequency: reminders.frequency,
      reminderDate: reminders.reminderDate,
      isActive: reminders.isActive,
      isCompleted: reminders.isCompleted,
      createdAt: reminders.createdAt,
      updatedAt: reminders.updatedAt,
    })
    .from(reminders)
    .where(eq(reminders.id, reminderId))
    .limit(1);

  const reminder = rows[0];
  if (!reminder) return;
  if (!reminder.isActive || reminder.isCompleted) {
    const job = await notificationsQueue.getJob(`reminder_due-${reminderId}`);
    if (job) {
      try {
        await job.remove();
      } catch {}
    }
    return;
  }

  const nextAt = nextReminderOccurrence(reminder, new Date());
  if (!nextAt) return;

  await upsertJob(
    `reminder_due-${reminderId}`,
    'reminder_due',
    {
      reminderId: String(reminder.id),
      userId: String(reminder.userId),
      title: String(reminder.title),
      runAt: nextAt.toISOString(),
      reminderUpdatedAt: new Date(reminder.updatedAt as any).toISOString(),
    },
    nextAt.getTime() - Date.now(),
  );
};

export const unscheduleReminderDuePush = async (reminderId: string) => {
  const job = await notificationsQueue.getJob(`reminder_due-${reminderId}`);
  if (!job) return;
  try {
    await job.remove();
  } catch {}
};

let workerStarted = false;

export const bootstrapNotificationSchedules = async () => {
  const now = new Date();
  const horizon = new Date(now.getTime() + 24 * 60 * 60_000);
  const recent = new Date(now.getTime() - 5 * 60_000);

  const taskRows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.isCompleted, false), gte(tasks.dueDate, recent), lte(tasks.dueDate, horizon)));

  for (const t of taskRows) {
    try {
      await scheduleTaskDuePush(String(t.id));
    } catch {}
  }

  const reminderRows = await db
    .select({ id: reminders.id })
    .from(reminders)
    .where(and(eq(reminders.isActive, true), eq(reminders.isCompleted, false)));

  for (const r of reminderRows) {
    try {
      await scheduleReminderDuePush(String(r.id));
    } catch {}
  }
};

export const startNotificationsWorker = () => {
  if (workerStarted) return;
  workerStarted = true;

  new Worker(
    queueName,
    async (job) => {
      if (job.name === 'task_due') {
        const taskId = String((job.data as any)?.taskId ?? '');
        const userId = String((job.data as any)?.userId ?? '');
        const title = String((job.data as any)?.title ?? 'Task');
        const dueDate = String((job.data as any)?.dueDate ?? '');

        if (!taskId || !userId) return;

        const rows = await db
          .select({
            id: tasks.id,
            userId: tasks.userId,
            title: tasks.title,
            taskType: tasks.taskType,
            petId: tasks.petId,
            petName: pets.name,
            dueDate: tasks.dueDate,
            isCompleted: tasks.isCompleted,
          })
          .from(tasks)
          .innerJoin(pets, eq(tasks.petId, pets.id))
          .where(eq(tasks.id, taskId))
          .limit(1);

        const t = rows[0];
        if (!t) return;
        if (t.isCompleted) return;
        if (dueDate && new Date(t.dueDate as any).toISOString() !== dueDate) return;

        const petName = String(t.petName ?? '');
        const taskType = String(t.taskType ?? '').toLowerCase();
        await NotificationsService.sendToUsers(
          [String(t.userId)],
          {
            title: petName ? `Time for ${petName}'s ${taskType}` : `"${String(t.title)}" is due now`,
            body: `"${String(t.title)}" is due now`,
            data: { taskId: String(t.id), event: 'task_due' },
            type: 'TASK_DUE',
          },
          { targetMode: 'single' },
        );
        return;
      }

      if (job.name === 'task_reminder') {
        const taskId = String((job.data as any)?.taskId ?? '');
        const reminderMinutes = Number((job.data as any)?.reminderMinutes ?? 0);
        const dueDate = String((job.data as any)?.dueDate ?? '');
        if (!taskId || !reminderMinutes) return;
        await handleTaskReminderJob(taskId, reminderMinutes, dueDate);
        return;
      }

      if (job.name === 'reminder_due') {
        const reminderId = String((job.data as any)?.reminderId ?? '');
        const reminderUpdatedAt = String((job.data as any)?.reminderUpdatedAt ?? '');
        if (!reminderId) return;

        const rows = await db
          .select({
            id: reminders.id,
            userId: reminders.userId,
            title: reminders.title,
            reminderTime: reminders.reminderTime,
            frequency: reminders.frequency,
            reminderDate: reminders.reminderDate,
            isActive: reminders.isActive,
            isCompleted: reminders.isCompleted,
            createdAt: reminders.createdAt,
            updatedAt: reminders.updatedAt,
          })
          .from(reminders)
          .where(eq(reminders.id, reminderId))
          .limit(1);

        const r = rows[0];
        if (!r) return;
        if (!r.isActive || r.isCompleted) return;
        if (reminderUpdatedAt && new Date(r.updatedAt as any).toISOString() !== reminderUpdatedAt) return;

        await NotificationsService.sendToUsers(
          [String(r.userId)],
          { title: 'Reminder', body: String(r.title), data: { reminderId: String(r.id), event: 'reminder_due' }, type: 'REMINDER_DUE' },
          { targetMode: 'single' },
        );

        const freq = getFrequency(r.frequency);
        if (freq.includes('once') || freq.includes('one')) {
          await db.update(reminders).set({ isCompleted: true, updatedAt: new Date() }).where(and(eq(reminders.id, reminderId), eq(reminders.userId, r.userId)));
          await unscheduleReminderDuePush(reminderId);
          return;
        }

        await scheduleReminderDuePush(reminderId);
        return;
      }
    },
    { connection, concurrency: 20 },
  );
};
