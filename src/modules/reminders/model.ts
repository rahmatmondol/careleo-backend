import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/shared/db';
import { reminders, pets } from '@/shared/db/schema';

export const RemindersModel = {
  /** Ensure pet belongs to user before reminder operations. */
  async userOwnsPet(userId: string, petId: string) {
    const rows = await db
      .select({ id: pets.id })
      .from(pets)
      .where(and(eq(pets.id, petId), eq(pets.userId, userId)))
      .limit(1);
    return Boolean(rows[0]);
  },

  /** Create reminder. */
  async createReminder(payload: {
    userId: string;
    petId: string;
    title: string;
    reminderType: string;
    frequency: string;
    reminderDate?: string;
    reminderTime?: string;
    notes?: string;
  }) {
    const rows = await db.insert(reminders).values(payload).returning();
    return rows[0] ?? null;
  },

  /** List reminders by user. */
  async listReminders(userId: string) {
    return db.select().from(reminders).where(eq(reminders.userId, userId)).orderBy(desc(reminders.createdAt));
  },

  /** Get one reminder by id/user. */
  async getReminder(userId: string, id: string) {
    const rows = await db
      .select()
      .from(reminders)
      .where(and(eq(reminders.id, id), eq(reminders.userId, userId)))
      .limit(1);
    return rows[0] ?? null;
  },

  /** Update reminder by id/user. */
  async updateReminder(
    userId: string,
    id: string,
    payload: Partial<{
      title: string;
      reminderType: string;
      frequency: string;
      reminderDate: string;
      reminderTime: string;
      notes: string;
      isCompleted: boolean;
      isActive: boolean;
    }>,
  ) {
    await db.update(reminders).set({ ...payload, updatedAt: new Date() }).where(and(eq(reminders.id, id), eq(reminders.userId, userId)));
    return this.getReminder(userId, id);
  },

  /** Delete reminder by id/user. */
  async deleteReminder(userId: string, id: string) {
    const rows = await db
      .delete(reminders)
      .where(and(eq(reminders.id, id), eq(reminders.userId, userId)))
      .returning({ id: reminders.id });
    return rows[0] ?? null;
  },
};
