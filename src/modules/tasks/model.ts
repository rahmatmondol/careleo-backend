import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/shared/db';
import { pets, tasks } from '@/shared/db/schema';

export const TasksModel = {
  /** Ensure pet belongs to user before task operations. */
  async userOwnsPet(userId: string, petId: string) {
    const rows = await db
      .select({ id: pets.id })
      .from(pets)
      .where(and(eq(pets.id, petId), eq(pets.userId, userId)))
      .limit(1);
    return Boolean(rows[0]);
  },

  /** Create a task under user+pet. */
  async createTask(payload: {
    userId: string;
    petId: string;
    title: string;
    taskType: string;
    frequency?: string;
    dueDate: Date;
    notes?: string;
  }) {
    const rows = await db.insert(tasks).values(payload).returning();
    return rows[0] ?? null;
  },

  /** List tasks for authenticated user with pet name. */
  async listTasks(userId: string) {
    return db
      .select({
        id: tasks.id,
        userId: tasks.userId,
        petId: tasks.petId,
        petName: pets.name,
        title: tasks.title,
        taskType: tasks.taskType,
        frequency: tasks.frequency,
        dueDate: tasks.dueDate,
        notes: tasks.notes,
        isCompleted: tasks.isCompleted,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .innerJoin(pets, eq(tasks.petId, pets.id))
      .where(eq(tasks.userId, userId))
      .orderBy(desc(tasks.dueDate), desc(tasks.createdAt));
  },

  /** Get one task by id/user. */
  async getTask(userId: string, id: string) {
    const rows = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .limit(1);
    return rows[0] ?? null;
  },

  /** Update one task by id/user. */
  async updateTask(
    userId: string,
    id: string,
    payload: Partial<{ title: string; taskType: string; frequency: string; dueDate: Date; notes: string; isCompleted: boolean }>,
  ) {
    await db.update(tasks).set({ ...payload, updatedAt: new Date() }).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
    return this.getTask(userId, id);
  },

  /** Delete one task by id/user. */
  async deleteTask(userId: string, id: string) {
    const rows = await db
      .delete(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .returning({ id: tasks.id });
    return rows[0] ?? null;
  },
};
