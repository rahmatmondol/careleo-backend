import { ValidationError } from '@/shared/errors';
import { TasksModel } from './model';
import { scheduleTaskDuePush, unscheduleAllTaskReminderJobs, unscheduleTaskDuePush } from '@/shared/queue';
import { nextOccurrenceAfter, parseRecurrence } from './recurrence';

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

export const TasksService = {
  /** Create task from app payload. */
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
      await scheduleTaskDuePush(row.id);
    } catch {}

    return { message: 'Task created successfully', task: row };
  },

  /** List user tasks. */
  async list(userId: string, petId?: string) {
    const rows = await TasksModel.listTasks(userId, petId);
    return { tasks: rows };
  },

  /** Get single user task. */
  async get(userId: string, id: string) {
    const row = await TasksModel.getTask(userId, id);
    if (!row) throw new ValidationError('Task not found');
    return { task: row };
  },

  /** Update user task. */
  async update(userId: string, id: string, payload: Record<string, unknown>) {
    const before = await TasksModel.getTask(userId, id);
    if (!before) throw new ValidationError('Task not found');

    const updatePayload: Partial<{ title: string; taskType: string; frequency: string; dueDate: Date; notes: string; isCompleted: boolean }> = {};

    if (payload.title !== undefined) updatePayload.title = normalizeText(payload.title);
    if (payload.taskType !== undefined) updatePayload.taskType = normalizeText(payload.taskType);
    if (payload.frequency !== undefined) updatePayload.frequency = normalizeText(payload.frequency);
    if (payload.dueDate !== undefined) {
      const dueDate = parseDate(payload.dueDate);
      if (!dueDate) throw new ValidationError('Invalid dueDate');
      updatePayload.dueDate = dueDate;
    }
    if (payload.notes !== undefined) updatePayload.notes = normalizeText(payload.notes);
    if (payload.isCompleted !== undefined) updatePayload.isCompleted = Boolean(payload.isCompleted);

    const row = await TasksModel.updateTask(userId, id, updatePayload);
    if (!row) throw new ValidationError('Task not found');

    try {
      if (row.isCompleted) {
        await unscheduleTaskDuePush(id);
        await unscheduleAllTaskReminderJobs(id);
      } else {
        await scheduleTaskDuePush(id);
      }
    } catch {}

    // A recurring task that was just ticked off spawns its next occurrence, so
    // "feed Bella daily" keeps existing tomorrow. The completed row stays as
    // history.
    let nextTask = null;
    if (!before.isCompleted && row.isCompleted) {
      nextTask = await TasksService.createNextOccurrence(userId, row);
    }

    return { message: 'Task updated successfully', task: row, ...(nextTask ? { nextTask } : {}) };
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
    const nextDue = nextOccurrenceAfter(dueDate, task.frequency);
    if (!nextDue) return null;

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
        await scheduleTaskDuePush(row.id);
      } catch {}
    }
    return row ?? null;
  },

  /** Delete user task. */
  async remove(userId: string, id: string) {
    const row = await TasksModel.deleteTask(userId, id);
    if (!row) throw new ValidationError('Task not found');

    try {
      await unscheduleTaskDuePush(id);
      await unscheduleAllTaskReminderJobs(id);
    } catch {}

    return { message: 'Task deleted successfully' };
  },
};
