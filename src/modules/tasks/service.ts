import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import { TasksModel } from './model';
import { syncTaskSchedule } from '@/shared/queue';
import { nextOccurrenceAfter, parseRecurrence } from './recurrence';
import { adaptDueDate } from './adaptive';

const normalizeText = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const v = String(value).trim();
  return v.length ? v : undefined;
};

const parseDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/** How far back a "I actually did this earlier" correction may reach. */
const BACKDATE_LIMIT_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * How long a completion stays editable.
 *
 * Long enough to cover the mis-tap and the second thought, short enough that
 * the care record stops moving. Deliberately not symmetric with the backdate
 * limit: logging something late is normal, rewriting it days later is not.
 */
const UNDO_WINDOW_MS = 4 * 60 * 60 * 1000;

/**
 * When the task was really done.
 *
 * Marking a 7am feeding at 9am used to record 9am, which is the number that
 * feeds both the adaptive scheduler and the medication adherence a vet is shown
 * — so the app has to let people say "I did this earlier". The value is clamped
 * rather than rejected: a clock-skewed phone should not fail the completion.
 */
const resolveCompletedAt = (value: unknown): Date => {
  const now = new Date();
  const given = parseDate(value);
  if (!given) return now;
  if (given.getTime() > now.getTime()) return now;
  if (now.getTime() - given.getTime() > BACKDATE_LIMIT_MS) {
    throw new ValidationError('completedAt cannot be more than 7 days ago');
  }
  return given;
};

type TaskRow = Awaited<ReturnType<typeof TasksModel.getTask>>;

export const TasksService = {
  /** Create task from app payload. Owner only. */
  async create(userId: string, payload: Record<string, unknown>) {
    const petId = normalizeText(payload.petId);
    const title = normalizeText(payload.title);
    if (!petId || !title) throw new ValidationError('petId and title are required');

    const ownsPet = await TasksModel.userOwnsPet(userId, petId);
    if (!ownsPet) throw new ValidationError('Pet not found');

    const dueDate = parseDate(payload.dueDate) ?? new Date();
    const row = await TasksModel.createTask({
      userId,
      petId,
      title,
      taskType: normalizeText(payload.taskType) ?? 'OTHER',
      frequency: normalizeText(payload.frequency) ?? 'none',
      dueDate,
      notes: normalizeText(payload.notes),
    });

    if (!row) throw new ValidationError('Failed to create task');

    try {
      await syncTaskSchedule(userId, dueDate);
    } catch {}

    return { message: 'Task created successfully', task: row };
  },

  /** List tasks for the user — their pets' and any they help care for. */
  async list(userId: string, petId?: string) {
    const rows = await TasksModel.listTasks(userId, petId);
    return { tasks: rows };
  },

  async get(userId: string, id: string) {
    const row = await TasksModel.getTask(userId, id);
    if (!row) throw new NotFoundError('Task not found');
    return { task: row };
  },

  /**
   * Edit a task. Only the owner may change what a task *is*; a caregiver can
   * only change whether it happened, which goes through `complete`/`skip`.
   */
  async update(userId: string, id: string, payload: Record<string, unknown>) {
    // Completion is its own operation with its own rules and its own audit
    // trail, so route it there rather than duplicating the logic.
    if (payload.isCompleted !== undefined && Object.keys(payload).length <= 2) {
      return Boolean(payload.isCompleted)
        ? this.complete(userId, id, { completedAt: payload.completedAt })
        : this.uncomplete(userId, id);
    }

    const before = await TasksModel.getOwnedTask(userId, id);
    if (!before) {
      // Distinguish "not yours to edit" from "does not exist" — a caregiver
      // editing somebody else's schedule deserves a clear answer.
      const visible = await TasksModel.getTask(userId, id);
      if (visible) throw new ForbiddenError('Only the pet owner can edit this task');
      throw new NotFoundError('Task not found');
    }

    const updatePayload: Record<string, unknown> = {};

    if (payload.title !== undefined) updatePayload.title = normalizeText(payload.title);
    if (payload.taskType !== undefined) updatePayload.taskType = normalizeText(payload.taskType);
    if (payload.frequency !== undefined) updatePayload.frequency = normalizeText(payload.frequency);
    if (payload.dueDate !== undefined) {
      const dueDate = parseDate(payload.dueDate);
      if (!dueDate) throw new ValidationError('Invalid dueDate');
      updatePayload.dueDate = dueDate;
    }
    if (payload.notes !== undefined) updatePayload.notes = normalizeText(payload.notes);
    if (payload.isCompleted !== undefined) {
      updatePayload.isCompleted = Boolean(payload.isCompleted);
      updatePayload.completedAt = updatePayload.isCompleted ? resolveCompletedAt(payload.completedAt) : null;
      updatePayload.completedBy = updatePayload.isCompleted ? userId : null;
    }

    const row = await TasksModel.updateTask(id, updatePayload);
    if (!row) throw new NotFoundError('Task not found');

    await this.resyncSlots(before.userId, before.dueDate, row.dueDate);

    let nextTask = null;
    if (!before.isCompleted && row.isCompleted) {
      nextTask = await this.createNextOccurrence(before.userId, row);
    }

    return { message: 'Task updated successfully', task: row, ...(nextTask ? { nextTask } : {}) };
  },

  /**
   * Mark a task done. Available to the owner and to accepted caregivers, which
   * is the whole point of a care circle — the person who gave the dose is the
   * person who should be able to record it.
   */
  async complete(userId: string, id: string, opts: { completedAt?: unknown } = {}) {
    const before = await this.requireActionable(userId, id);
    if (before.isCompleted) return { message: 'Already completed', task: before };

    const completedAt = resolveCompletedAt(opts.completedAt);

    const row = await TasksModel.updateTask(id, {
      isCompleted: true,
      completedAt,
      completedBy: userId,
      // Completing something previously skipped supersedes the skip.
      skippedAt: null,
      skipReason: null,
    });
    if (!row) throw new NotFoundError('Task not found');

    await this.resyncSlots(before.userId, before.dueDate, row.dueDate);

    const nextTask = await this.createNextOccurrence(before.userId, row);

    return {
      message: 'Task completed',
      task: row,
      ...(nextTask ? { nextTask } : {}),
    };
  },

  /**
   * Undo a completion.
   *
   * Undo exists for the mis-tap, not for editing history. Past the window a
   * completion is a care record — a dose logged three weeks ago is what a vet
   * is shown, and it should not quietly change. Marking something done late is
   * still always allowed; only rewriting it afterwards is bounded.
   *
   * The spawned next occurrence goes with it — otherwise undoing a mis-tap
   * leaves tomorrow's task sitting there, created by something that never
   * happened. Only an untouched future occurrence is removed.
   */
  async uncomplete(userId: string, id: string) {
    const before = await this.requireActionable(userId, id);

    if (before.isCompleted && before.completedAt) {
      const age = Date.now() - new Date(before.completedAt as any).getTime();
      if (age > UNDO_WINDOW_MS) {
        throw new ValidationError(
          'This was completed more than 4 hours ago and can no longer be undone.',
        );
      }
    }

    const row = await TasksModel.updateTask(id, {
      isCompleted: false,
      completedAt: null,
      completedBy: null,
      skippedAt: null,
      skipReason: null,
    });
    if (!row) throw new NotFoundError('Task not found');

    let removedNext = false;
    if (before.isCompleted && before.petId && parseRecurrence(before.frequency) !== 'none') {
      const dueDate = new Date(before.dueDate as any);
      // Bound the search to the one period this completion could have spawned.
      // "Earliest open task after the old due date" used to reach past it and
      // delete a later, legitimately scheduled occurrence.
      const expected = nextOccurrenceAfter(dueDate, before.frequency);
      const periodEnd = expected ? nextOccurrenceAfter(expected, before.frequency) : null;

      const spawned = await TasksModel.findSpawnedOccurrence(
        before.userId,
        before.petId,
        before.title,
        new Date(dueDate.getTime() + 60_000),
        periodEnd ?? undefined,
      );
      if (spawned) {
        const deleted = await TasksModel.deleteById(spawned.id);
        removedNext = Boolean(deleted);
        if (deleted) {
          try {
            await syncTaskSchedule(before.userId, deleted.dueDate as any);
          } catch {}
        }
      }
    }

    await this.resyncSlots(before.userId, before.dueDate, row.dueDate);

    return { message: 'Completion undone', task: row, removedNextOccurrence: removedNext };
  },

  /**
   * Deliberately not doing it — "the vet said skip today's dose".
   *
   * Stops the reminders like a completion does and rolls the recurrence
   * forward, but is excluded from adherence instead of counted as a miss.
   */
  async skip(userId: string, id: string, reason?: unknown) {
    const before = await this.requireActionable(userId, id);

    const row = await TasksModel.updateTask(id, {
      isCompleted: false,
      completedAt: null,
      completedBy: null,
      skippedAt: new Date(),
      skipReason: normalizeText(reason)?.slice(0, 200) ?? null,
    });
    if (!row) throw new NotFoundError('Task not found');

    await this.resyncSlots(before.userId, before.dueDate, row.dueDate);

    // A skipped dose should not end the schedule; tomorrow still needs doing.
    const nextTask = await this.createNextOccurrence(before.userId, row);

    return { message: 'Task skipped', task: row, ...(nextTask ? { nextTask } : {}) };
  },

  /**
   * Complete everything still open in a window — "the whole morning is done".
   *
   * Given explicit ids when the app has them, or a time range when the user
   * taps the section header.
   */
  async completeMany(
    userId: string,
    payload: { ids?: unknown; from?: unknown; to?: unknown; petId?: unknown; completedAt?: unknown },
  ) {
    let ids: string[] = Array.isArray(payload.ids)
      ? payload.ids.map((x) => String(x).trim()).filter(Boolean)
      : [];

    if (!ids.length) {
      const from = parseDate(payload.from);
      const to = parseDate(payload.to);
      if (!from || !to) throw new ValidationError('Provide either ids, or a from/to range');
      if (to.getTime() <= from.getTime()) throw new ValidationError('`to` must be after `from`');

      const open = await TasksModel.listOpenTasksBetween(
        userId,
        from,
        to,
        normalizeText(payload.petId),
      );
      ids = open.map((t) => t.id);
    }

    if (ids.length > 100) throw new ValidationError('Too many tasks in one request (max 100)');

    const completed: string[] = [];
    const nextTasks: unknown[] = [];
    const failed: Array<{ id: string; reason: string }> = [];

    for (const id of ids) {
      try {
        const result = await this.complete(userId, id, { completedAt: payload.completedAt });
        completed.push(id);
        if ((result as any).nextTask) nextTasks.push((result as any).nextTask);
      } catch (e: any) {
        // One inaccessible or deleted id must not sink the whole batch.
        failed.push({ id, reason: e?.message ?? 'Failed' });
      }
    }

    return {
      message: `${completed.length} task${completed.length === 1 ? '' : 's'} completed`,
      completed,
      nextTasks,
      ...(failed.length ? { failed } : {}),
    };
  },

  /**
   * Create the following occurrence of a recurring task. Returns null when the
   * task does not repeat, or when the next slot already exists (so a double
   * complete/uncomplete cannot duplicate the schedule).
   */
  async createNextOccurrence(userId: string, task: {
    id: string;
    petId: string | null;
    title: string;
    taskType: string | null;
    frequency: string | null;
    dueDate: Date | string;
    notes?: string | null;
  }) {
    if (parseRecurrence(task.frequency) === 'none' || !task.petId) return null;

    const dueDate = task.dueDate instanceof Date ? task.dueDate : new Date(task.dueDate);
    const scheduled = nextOccurrenceAfter(dueDate, task.frequency);
    if (!scheduled) return null;

    // Nudge the next slot towards the time this owner actually does it.
    const { dueDate: nextDue } = await adaptDueDate(userId, task.petId, task.title, scheduled);

    const duplicate = await TasksModel.findOpenTaskAt(userId, task.petId, task.title, nextDue);
    if (duplicate) return null;

    const row = await TasksModel.createTask({
      userId,
      petId: task.petId,
      title: task.title,
      taskType: task.taskType ?? 'OTHER',
      frequency: task.frequency ?? 'none',
      dueDate: nextDue,
      notes: task.notes ?? undefined,
    });

    if (row) {
      try {
        await syncTaskSchedule(userId, nextDue);
      } catch {}
    }
    return row ?? null;
  },

  /**
   * Push a task out by `minutes` from now.
   *
   * This is what the notification's "Snooze" button calls, so it has to work
   * from a payload that only carries the task id.
   */
  async snooze(userId: string, id: string, minutes: number) {
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 24 * 60) {
      throw new ValidationError('minutes must be between 1 and 1440');
    }

    const before = await this.requireActionable(userId, id);

    const nextDue = new Date(Date.now() + Math.floor(minutes) * 60_000);
    const row = await TasksModel.updateTask(id, {
      dueDate: nextDue,
      isCompleted: false,
      completedAt: null,
      completedBy: null,
      skippedAt: null,
      skipReason: null,
    });
    if (!row) throw new NotFoundError('Task not found');

    await this.resyncSlots(before.userId, before.dueDate, nextDue);

    return { message: `Snoozed for ${Math.floor(minutes)} minutes`, task: row };
  },

  /** Delete user task. Owner only. */
  async remove(userId: string, id: string) {
    const row = await TasksModel.deleteTask(userId, id);
    if (!row) {
      const visible = await TasksModel.getTask(userId, id);
      if (visible) throw new ForbiddenError('Only the pet owner can delete this task');
      throw new NotFoundError('Task not found');
    }

    try {
      await syncTaskSchedule(userId, row.dueDate as any);
    } catch {}

    return { message: 'Task deleted successfully' };
  },

  // ── Internals ────────────────────────────────────────────────────────────

  /**
   * The task, if this person may record what happened to it.
   *
   * Owners and accepted caregivers both qualify; `TasksModel.getTask` already
   * scopes to exactly that set.
   */
  async requireActionable(userId: string, id: string): Promise<NonNullable<TaskRow>> {
    const task = await TasksModel.getTask(userId, id);
    if (!task) throw new NotFoundError('Task not found');
    return task;
  },

  /**
   * Recompute the notification slots a change touched: the one the task left
   * and the one it landed in. Always keyed on the *owner*, since that is whose
   * schedule the bundles belong to.
   */
  async resyncSlots(ownerId: string, before: Date | string, after: Date | string) {
    try {
      await syncTaskSchedule(ownerId, before as any);
      await syncTaskSchedule(ownerId, after as any);
    } catch {}
  },
};
