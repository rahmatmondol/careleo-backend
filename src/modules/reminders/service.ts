import { ValidationError } from '@/shared/errors';
import { RemindersModel } from './model';
import { NotificationsService } from '@/modules/notifications/service';
import { scheduleReminderDuePush, unscheduleReminderDuePush } from '@/shared/queue';

const normalizeText = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const v = String(value).trim();
  return v.length ? v : undefined;
};

export const RemindersService = {
  /** Create reminder from app payload. */
  async create(userId: string, payload: Record<string, unknown>) {
    const petId = normalizeText(payload.petId);
    const title = normalizeText(payload.title);
    if (!petId || !title) throw new ValidationError('petId and title are required');

    const ownsPet = await RemindersModel.userOwnsPet(userId, petId);
    if (!ownsPet) throw new ValidationError('Pet not found');

    const row = await RemindersModel.createReminder({
      userId,
      petId,
      title,
      reminderType: normalizeText(payload.reminderType ?? payload.type) ?? 'activity',
      frequency: normalizeText(payload.frequency) ?? 'Everyday',
      reminderDate: normalizeText(payload.reminderDate),
      reminderTime: normalizeText(payload.reminderTime),
      notes: normalizeText(payload.notes),
    });

    if (!row) throw new ValidationError('Failed to create reminder');

    try {
      await NotificationsService.sendToUsers(
        [userId],
        {
          title: 'Reminder created',
          body: `${title} reminder has been created`,
          data: { reminderId: row.id, event: 'reminder_created' },
          type: 'REMINDER_CREATED',
        },
        { targetMode: 'single' },
      );
    } catch {
      // Don't block reminder create if push delivery fails.
    }

    try {
      await scheduleReminderDuePush(row.id);
    } catch {}

    return { message: 'Reminder created successfully', reminder: row };
  },

  /** List user reminders. */
  async list(userId: string) {
    const rows = await RemindersModel.listReminders(userId);
    return { reminders: rows };
  },

  /** Get reminder by id. */
  async get(userId: string, id: string) {
    const row = await RemindersModel.getReminder(userId, id);
    if (!row) throw new ValidationError('Reminder not found');
    return { reminder: row };
  },

  /** Update reminder by id. */
  async update(userId: string, id: string, payload: Record<string, unknown>) {
    const row = await RemindersModel.updateReminder(userId, id, {
      ...(payload.title !== undefined ? { title: normalizeText(payload.title) } : {}),
      ...(payload.reminderType !== undefined ? { reminderType: normalizeText(payload.reminderType) } : {}),
      ...(payload.type !== undefined ? { reminderType: normalizeText(payload.type) } : {}),
      ...(payload.frequency !== undefined ? { frequency: normalizeText(payload.frequency) } : {}),
      ...(payload.reminderDate !== undefined ? { reminderDate: normalizeText(payload.reminderDate) } : {}),
      ...(payload.reminderTime !== undefined ? { reminderTime: normalizeText(payload.reminderTime) } : {}),
      ...(payload.notes !== undefined ? { notes: normalizeText(payload.notes) } : {}),
      ...(payload.isCompleted !== undefined ? { isCompleted: Boolean(payload.isCompleted) } : {}),
      ...(payload.isActive !== undefined ? { isActive: Boolean(payload.isActive) } : {}),
    });

    if (!row) throw new ValidationError('Reminder not found');

    try {
      if (!row.isActive || row.isCompleted) {
        await unscheduleReminderDuePush(id);
      } else {
        await scheduleReminderDuePush(id);
      }
    } catch {}

    return { message: 'Reminder updated successfully', reminder: row };
  },

  /** Delete reminder by id. */
  async remove(userId: string, id: string) {
    const row = await RemindersModel.deleteReminder(userId, id);
    if (!row) throw new ValidationError('Reminder not found');

    try {
      await unscheduleReminderDuePush(id);
    } catch {}

    return { message: 'Reminder deleted successfully' };
  },
};
