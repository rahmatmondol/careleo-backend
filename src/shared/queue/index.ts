/**
 * Scheduled push delivery (BullMQ over Redis).
 *
 * Task pushes are **bundled per user, per 10-minute slot**, not sent per task.
 * The job id carries the slot (`task_digest-<userId>-<bucketStart>`), so five
 * tasks due at 08:00 collapse into one job — and therefore one notification —
 * without any extra bookkeeping. Scheduling is idempotent: re-running it for
 * any task in a slot just recomputes that slot.
 *
 * Follow-ups are capped. An unfinished task gets at most
 * `taskEscalationLimit` (default 2) reminder pushes, after which the app stops
 * buzzing and `task-checker` hands the thread to the AI chat instead.
 */

import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { and, asc, eq, gte, isNull, lt, lte } from 'drizzle-orm';
import { db } from '@/shared/db';
import { pets, reminders, taskReminderLogs, tasks, users } from '@/shared/db/schema';
import { CaregiversModel } from '@/modules/caregivers/model';
import { NotificationsService, type PushPayload } from '@/modules/notifications/service';
import { deliverToUser } from '@/modules/notifications/deliver';
import { getPreferenceContext, priorityForTaskType, type NotificationPriority } from '@/modules/notifications/preferences';

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

const removeJob = async (jobId: string) => {
  const job = await notificationsQueue.getJob(jobId);
  if (!job) return;
  try {
    await job.remove();
  } catch {}
};

// ── Task digest bundling ───────────────────────────────────────────────────

/** Tasks due within the same slot are announced together. */
const DIGEST_BUCKET_MS = 10 * 60 * 1000;

/**
 * Minutes after the slot's due time at which unfinished tasks are chased.
 * Step N only fires when the user's `taskEscalationLimit` is at least N, so a
 * user who sets the limit to 0 is never nagged at all.
 */
const ESCALATION_STEPS_MIN = [15, 60] as const;

/**
 * When a *critical* task (a dose, a vaccine) is still open this long after it
 * was due, the household is told. One person can forget medication; a second
 * pair of eyes is the whole reason shared care exists. Non-critical tasks never
 * reach anybody but the owner.
 */
const CAREGIVER_ALERT_MIN = 120;

/**
 * When a task the owner asked to be woken for is still open this long after it
 * was due, it stops being a notification and becomes an alarm — a full-screen
 * takeover with a sound, the way a call arrives.
 *
 * Only tasks with `alarmOnMiss` ever reach this, and only until the owner has
 * dismissed the same task twice. Anything that decides on its own what may
 * wake someone gets the whole app's notifications switched off, which costs
 * the doses that did matter.
 */
const ALARM_AFTER_MIN = 30;
const ALARM_DISMISSAL_LIMIT = 2;

/**
 * How late an alarm may still be raised after its moment has passed.
 *
 * The moment can be missed for ordinary reasons — the server was restarted,
 * the task was created already overdue, the owner switched the alarm on after
 * the fact. Skipping those meant the alarm silently never fired, which is the
 * one failure a feature like this cannot have.
 *
 * Bounded, though: waking someone at 3am over a dose missed yesterday morning
 * helps nobody, and the task list is the right place to find that out.
 */
const ALARM_LATE_GRACE_MS = 6 * 60 * 60 * 1000;

const bucketStartOf = (due: Date) => Math.floor(due.getTime() / DIGEST_BUCKET_MS) * DIGEST_BUCKET_MS;

const digestJobId = (userId: string, bucketStart: number) => `task_digest-${userId}-${bucketStart}`;
const escalateJobId = (userId: string, bucketStart: number, step: number) =>
  `task_escalate-${userId}-${bucketStart}-${step}`;
const caregiverJobId = (userId: string, bucketStart: number) => `task_caregiver-${userId}-${bucketStart}`;
const alarmJobId = (taskId: string) => `task_alarm-${taskId}`;

type BucketTask = {
  id: string;
  userId: string;
  petId: string | null;
  petName: string | null;
  title: string;
  taskType: string | null;
  dueDate: Date;
  alarmOnMiss: boolean;
  alarmDismissals: number;
};

/** Has the owner asked to be woken for this one, and not yet waved it off twice? */
const wantsAlarm = (t: BucketTask) =>
  t.alarmOnMiss && (t.alarmDismissals ?? 0) < ALARM_DISMISSAL_LIMIT;

/** Every still-open task the user has in one slot, oldest first. */
const openTasksInBucket = async (userId: string, bucketStart: number): Promise<BucketTask[]> => {
  const rows = await db
    .select({
      id: tasks.id,
      userId: tasks.userId,
      petId: tasks.petId,
      petName: pets.name,
      title: tasks.title,
      taskType: tasks.taskType,
      dueDate: tasks.dueDate,
      alarmOnMiss: tasks.alarmOnMiss,
      alarmDismissals: tasks.alarmDismissals,
    })
    .from(tasks)
    .leftJoin(pets, eq(tasks.petId, pets.id))
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.isCompleted, false),
        // A deliberately skipped task must stop nagging like a completed one.
        isNull(tasks.skippedAt),
        gte(tasks.dueDate, new Date(bucketStart)),
        lt(tasks.dueDate, new Date(bucketStart + DIGEST_BUCKET_MS)),
      ),
    )
    .orderBy(asc(tasks.dueDate));

  return rows.map((r) => ({ ...r, dueDate: new Date(r.dueDate as any) })) as BucketTask[];
};

/**
 * Recompute one user's slot: schedule the bundled push and its follow-ups, or
 * clear them when nothing is left open. Safe to call as often as you like.
 */
const refreshTaskBucket = async (userId: string, bucketStart: number) => {
  const open = await openTasksInBucket(userId, bucketStart);

  if (!open.length) {
    await removeJob(digestJobId(userId, bucketStart));
    for (let step = 1; step <= ESCALATION_STEPS_MIN.length; step++) {
      await removeJob(escalateJobId(userId, bucketStart, step));
    }
    await removeJob(caregiverJobId(userId, bucketStart));
    return;
  }

  // Alarms are per task, not per slot: each one takes over the whole screen, so
  // two due together must not fire as one ambiguous "something is open".
  for (const task of open) {
    if (!wantsAlarm(task)) {
      await removeJob(alarmJobId(task.id));
      continue;
    }
    const at = task.dueDate.getTime() + ALARM_AFTER_MIN * 60_000;
    const late = Date.now() - at;

    // Already past its moment: raise it now if it is still recent enough to be
    // worth acting on, rather than dropping it entirely.
    if (late > ALARM_LATE_GRACE_MS) {
      await removeJob(alarmJobId(task.id));
      continue;
    }

    await upsertJob(
      alarmJobId(task.id),
      'task_alarm',
      { taskId: task.id },
      late > 0 ? 5_000 : at - Date.now(),
    );
  }

  // Fire when the *last* task in the slot is actually due, so nothing is
  // announced early. The slot is 10 minutes wide, so nothing is late by more.
  const fireAt = open.reduce((max, t) => (t.dueDate > max ? t.dueDate : max), open[0].dueDate);

  await upsertJob(
    digestJobId(userId, bucketStart),
    'task_digest',
    { userId, bucketStart },
    fireAt.getTime() - Date.now(),
  );

  for (let i = 0; i < ESCALATION_STEPS_MIN.length; i++) {
    const step = i + 1;
    const at = fireAt.getTime() + ESCALATION_STEPS_MIN[i] * 60_000;
    const delay = at - Date.now();
    if (delay <= 0) continue;
    await upsertJob(escalateJobId(userId, bucketStart, step), 'task_escalate', { userId, bucketStart, step }, delay);
  }

  // Only worth queueing when something in the slot actually matters.
  if (open.some((t) => priorityForTaskType(t.taskType) === 'critical')) {
    const at = fireAt.getTime() + CAREGIVER_ALERT_MIN * 60_000;
    if (at > Date.now()) {
      await upsertJob(caregiverJobId(userId, bucketStart), 'task_caregiver', { userId, bucketStart }, at - Date.now());
    }
  } else {
    await removeJob(caregiverJobId(userId, bucketStart));
  }
};

/**
 * Bring a task's notifications in line with its current state.
 *
 * Called on create, update, complete and delete. On delete the caller passes
 * the row it just removed — the slot is recomputed from what remains.
 */
export const syncTaskSchedule = async (userId: string, dueDate: Date | string) => {
  const due = dueDate instanceof Date ? dueDate : new Date(dueDate);
  if (Number.isNaN(due.getTime())) return;
  await refreshTaskBucket(userId, bucketStartOf(due));
};

/** Convenience wrapper for callers that only hold a task id. */
export const scheduleTaskDuePush = async (taskId: string) => {
  const [row] = await db
    .select({ userId: tasks.userId, dueDate: tasks.dueDate })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!row) return;
  await syncTaskSchedule(String(row.userId), new Date(row.dueDate as any));
};

// ── Copy ───────────────────────────────────────────────────────────────────

const petLabel = (t: BucketTask) => String(t.petName ?? '').trim();

const listTitles = (list: BucketTask[], max = 3) => {
  const shown = list.slice(0, max).map((t) => t.title);
  const rest = list.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} +${rest} more` : shown.join(', ');
};

/** One notification covering everything open in the slot. */
const digestCopy = (list: BucketTask[], overdueMinutes = 0) => {
  const petNames = [...new Set(list.map(petLabel).filter(Boolean))];
  const single = list.length === 1;
  const late = overdueMinutes > 0;

  if (single) {
    const t = list[0];
    const pet = petLabel(t);
    const type = String(t.taskType ?? '').toLowerCase();
    const title = late
      ? pet
        ? `${pet}'s ${type || 'task'} is still open`
        : `"${t.title}" is still open`
      : pet
        ? `Time for ${pet}'s ${type || 'task'}`
        : `"${t.title}" is due now`;
    const body = late ? `${overdueMinutes} min overdue — ${t.title}` : t.title;
    return { title, body };
  }

  const who = petNames.length === 1 ? petNames[0] : `${petNames.length} pets`;
  const title = late
    ? `${list.length} care tasks still open`
    : petNames.length === 1
      ? `${who} has ${list.length} things due`
      : `${list.length} care tasks due now`;
  return { title, body: listTitles(list) };
};

const highestPriority = (list: BucketTask[]): NotificationPriority =>
  list.some((t) => priorityForTaskType(t.taskType) === 'critical') ? 'critical' : 'normal';

/**
 * Payload data the mobile app reads.
 *
 * `taskId` is only set for a single-task notification — that is what enables
 * the Done / Snooze action buttons. A bundle carries `taskIds` and opens the
 * task list instead, because no single action would be correct.
 */
const taskPushData = (list: BucketTask[], event: string, extra: Record<string, string> = {}) => ({
  event,
  count: String(list.length),
  taskIds: list.map((t) => t.id).join(','),
  ...(list.length === 1 ? { taskId: list[0].id, petId: String(list[0].petId ?? '') } : {}),
  ...extra,
});

// ── Job handlers ───────────────────────────────────────────────────────────

const handleTaskDigest = async (userId: string, bucketStart: number) => {
  const open = await openTasksInBucket(userId, bucketStart);
  if (!open.length) return;

  const { prefs } = await getPreferenceContext(userId);

  // Bundling off means the user asked for one notification per task.
  const groups = prefs.digestEnabled ? [open] : open.map((t) => [t]);

  for (const group of groups) {
    const { title, body } = digestCopy(group);
    await deliverToUser(userId, {
      title,
      body,
      type: 'TASK_DUE',
      priority: highestPriority(group),
      data: taskPushData(group, 'task_due'),
    });
  }
};

/**
 * The alarm: a single task the owner asked to be woken for, still open half an
 * hour after it was due.
 *
 * Sent as its own push with `alarm: '1'`, which is what makes the app draw a
 * full-screen takeover instead of a notification. It deliberately bypasses
 * `deliverToUser`: quiet hours and the category toggles exist so the phone
 * stays quiet for routine care, and an alarm the owner explicitly asked for on
 * this task is not routine. The per-task opt-in *is* the consent, and turning
 * it off is one tap on the task.
 */
const handleTaskAlarm = async (taskId: string) => {
  const rows = await db
    .select({
      id: tasks.id,
      userId: tasks.userId,
      petId: tasks.petId,
      petName: pets.name,
      title: tasks.title,
      taskType: tasks.taskType,
      dueDate: tasks.dueDate,
      isCompleted: tasks.isCompleted,
      skippedAt: tasks.skippedAt,
      alarmOnMiss: tasks.alarmOnMiss,
      alarmDismissals: tasks.alarmDismissals,
    })
    .from(tasks)
    .leftJoin(pets, eq(tasks.petId, pets.id))
    .where(eq(tasks.id, taskId))
    .limit(1);

  const task = rows[0];
  // Re-checked here rather than trusted from scheduling time: the task may have
  // been done, skipped, snoozed or had its alarm switched off since.
  if (!task || task.isCompleted || task.skippedAt || !task.alarmOnMiss) return;
  if ((task.alarmDismissals ?? 0) >= ALARM_DISMISSAL_LIMIT) return;
  if (new Date(task.dueDate as any).getTime() > Date.now()) return;

  const pet = task.petName ?? 'your pet';

  await NotificationsService.sendToUsers(
    [task.userId],
    {
      title: `${task.title} — still not done`,
      body: `${pet} was due this half an hour ago. Tap to sort it out.`,
      type: 'TASK_ALARM',
      priority: 'critical',
      data: {
        event: 'task_alarm',
        alarm: '1',
        taskId: task.id,
        petId: String(task.petId ?? ''),
        petName: pet,
        taskTitle: task.title,
        dueDate: new Date(task.dueDate as any).toISOString(),
      },
    },
    { targetMode: 'single' },
  );
};

const handleTaskEscalation = async (userId: string, bucketStart: number, step: number) => {
  const { prefs } = await getPreferenceContext(userId);
  if (step > prefs.taskEscalationLimit) return;

  const open = await openTasksInBucket(userId, bucketStart);
  if (!open.length) return;

  const minutesLate = ESCALATION_STEPS_MIN[step - 1] ?? 0;
  const { title, body } = digestCopy(open, minutesLate);

  const result = await deliverToUser(userId, {
    title,
    body,
    type: 'TASK_REMINDER',
    priority: highestPriority(open),
    data: taskPushData(open, `task_reminder_${minutesLate}`, { minutesOverdue: String(minutesLate) }),
  });

  try {
    await db.insert(taskReminderLogs).values(
      open.map((t) => ({
        taskId: t.id,
        userId,
        reminderStep: step,
        stepLabel: step === 1 ? 'FIRST_REMINDER' : 'SECOND_REMINDER',
        taskTitle: t.title,
        taskType: t.taskType ?? undefined,
        taskDueDate: t.dueDate,
        minutesSinceDue: minutesLate,
        wasCompleted: false,
        pushSent: result.outcome === 'sent',
        pushDelivered: result.sent > 0,
        pushSuccessCount: result.sent,
        pushFailureCount: result.failed,
      })),
    );
  } catch {}
};

/**
 * Tell the household about a critical task the owner has not done.
 *
 * Sent to each caregiver through `deliverToUser`, so their own quiet hours and
 * category switches still apply — being somebody's backup does not mean losing
 * control of your own phone.
 */
const handleCaregiverAlert = async (userId: string, bucketStart: number) => {
  const open = (await openTasksInBucket(userId, bucketStart)).filter(
    (t) => priorityForTaskType(t.taskType) === 'critical' && t.petId,
  );
  if (!open.length) return;

  const byPet = new Map<string, BucketTask[]>();
  for (const task of open) {
    const list = byPet.get(task.petId!) ?? [];
    list.push(task);
    byPet.set(task.petId!, list);
  }

  const recipients = await CaregiversModel.alertRecipientsForPets([...byPet.keys()]);
  if (![...recipients.values()].some((list) => list.length)) return;

  const [owner] = await db
    .select({ firstName: users.firstName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const ownerName = owner?.firstName?.trim() || 'The owner';

  for (const [petId, list] of byPet) {
    const helpers = (recipients.get(petId) ?? []).filter((id) => id !== userId);
    if (!helpers.length) continue;

    const petName = petLabel(list[0]) || 'the pet';
    const body =
      list.length === 1
        ? `${ownerName} hasn't marked "${list[0].title}" done. Can you check on ${petName}?`
        : `${ownerName} hasn't marked ${list.length} health tasks done. Can you check on ${petName}?`;

    for (const helperId of helpers) {
      await deliverToUser(helperId, {
        title: `${petName} needs a hand`,
        body,
        type: 'HEALTH_ALERT',
        priority: 'critical',
        data: { event: 'caregiver_alert', petId, taskIds: list.map((t) => t.id).join(',') },
      });
    }
  }
};

// ── Quiet-hours deferral ───────────────────────────────────────────────────

/** Stable-ish key so re-deferring the same event replaces it instead of piling up. */
const deferralKey = (payload: PushPayload) => {
  const data = payload.data ?? {};
  const marker = data.taskId || data.taskIds || data.reminderId || data.petId || payload.title;
  return `${payload.type ?? 'SYSTEM'}-${String(marker).slice(0, 60)}`.replace(/[^A-Za-z0-9_.:-]/g, '_');
};

/** Hold a push until the user's quiet window ends. Called by `deliverToUser`. */
export const enqueueDeferredPush = async (userId: string, payload: PushPayload, at: Date) => {
  await upsertJob(
    `deferred_push-${userId}-${deferralKey(payload)}`,
    'deferred_push',
    { userId, payload: payload as unknown as Record<string, unknown> },
    at.getTime() - Date.now(),
  );
};

// ── Reminders (unchanged scheduling model, one row = one notification) ──────

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
  const tomorrowAt = new Date(todayAt.getTime() + 24 * 60 * 60_000);

  if (freq.includes('once') || freq.includes('one')) {
    if (dateOnly) return new Date(dateOnly.getFullYear(), dateOnly.getMonth(), dateOnly.getDate(), hour, minute, 0, 0);
    return todayAt > now ? todayAt : tomorrowAt;
  }

  if (freq.includes('weekly')) {
    const base = dateOnly ?? createdAt ?? now;
    const targetDow = base.getDay();
    const out = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
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

  return todayAt > now ? todayAt : tomorrowAt;
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
    await removeJob(`reminder_due-${reminderId}`);
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
  await removeJob(`reminder_due-${reminderId}`);
};

// ── Bootstrap & worker ─────────────────────────────────────────────────────

let workerStarted = false;

export const bootstrapNotificationSchedules = async () => {
  const now = new Date();
  const horizon = new Date(now.getTime() + 24 * 60 * 60_000);
  const recent = new Date(now.getTime() - 5 * 60_000);

  const taskRows = await db
    .select({ userId: tasks.userId, dueDate: tasks.dueDate })
    .from(tasks)
    .where(
      and(
        eq(tasks.isCompleted, false),
        isNull(tasks.skippedAt),
        gte(tasks.dueDate, recent),
        lte(tasks.dueDate, horizon),
      ),
    );

  // One refresh per (user, slot) — the whole point of bucketing is that the
  // per-task fan-out disappears here too.
  const buckets = new Set(taskRows.map((t) => `${t.userId}|${bucketStartOf(new Date(t.dueDate as any))}`));
  for (const key of buckets) {
    const [userId, bucket] = key.split('|');
    try {
      await refreshTaskBucket(userId, Number(bucket));
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
      const data = (job.data ?? {}) as Record<string, any>;

      if (job.name === 'task_digest') {
        const userId = String(data.userId ?? '');
        const bucketStart = Number(data.bucketStart ?? 0);
        if (!userId || !bucketStart) return;
        await handleTaskDigest(userId, bucketStart);
        return;
      }

      if (job.name === 'task_escalate') {
        const userId = String(data.userId ?? '');
        const bucketStart = Number(data.bucketStart ?? 0);
        const step = Number(data.step ?? 0);
        if (!userId || !bucketStart || !step) return;
        await handleTaskEscalation(userId, bucketStart, step);
        return;
      }

      if (job.name === 'task_alarm') {
        const taskId = String(data.taskId ?? '');
        if (!taskId) return;
        await handleTaskAlarm(taskId);
        return;
      }

      if (job.name === 'task_caregiver') {
        const userId = String(data.userId ?? '');
        const bucketStart = Number(data.bucketStart ?? 0);
        if (!userId || !bucketStart) return;
        await handleCaregiverAlert(userId, bucketStart);
        return;
      }

      if (job.name === 'deferred_push') {
        const userId = String(data.userId ?? '');
        const payload = data.payload as PushPayload | undefined;
        if (!userId || !payload?.title) return;
        // The in-app row was already written when this was deferred.
        await NotificationsService.sendToUsers([userId], payload, { targetMode: 'single', recordInApp: false });
        return;
      }

      if (job.name === 'reminder_due') {
        const reminderId = String(data.reminderId ?? '');
        const reminderUpdatedAt = String(data.reminderUpdatedAt ?? '');
        if (!reminderId) return;

        const rows = await db
          .select({
            id: reminders.id,
            userId: reminders.userId,
            title: reminders.title,
            frequency: reminders.frequency,
            isActive: reminders.isActive,
            isCompleted: reminders.isCompleted,
            updatedAt: reminders.updatedAt,
          })
          .from(reminders)
          .where(eq(reminders.id, reminderId))
          .limit(1);

        const r = rows[0];
        if (!r) return;
        if (!r.isActive || r.isCompleted) return;
        if (reminderUpdatedAt && new Date(r.updatedAt as any).toISOString() !== reminderUpdatedAt) return;

        await deliverToUser(String(r.userId), {
          title: 'Reminder',
          body: String(r.title),
          data: { reminderId: String(r.id), event: 'reminder_due' },
          type: 'REMINDER_DUE',
        });

        const freq = getFrequency(r.frequency);
        if (freq.includes('once') || freq.includes('one')) {
          await db
            .update(reminders)
            .set({ isCompleted: true, updatedAt: new Date() })
            .where(and(eq(reminders.id, reminderId), eq(reminders.userId, r.userId)));
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
