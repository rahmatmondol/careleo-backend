import { and, asc, desc, eq, gte, lt, ne, sql } from 'drizzle-orm';
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

  /** List tasks for authenticated user with pet name. Optionally filter by pet. */
  async listTasks(userId: string, petId?: string) {
    const conditions = [eq(tasks.userId, userId)];
    if (petId) conditions.push(eq(tasks.petId, petId));
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
      .where(and(...conditions))
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

  /**
   * Same pet, same title, same day, still open — used to stop a recurring task
   * from being spawned twice (complete → undo → complete).
   */
  async findOpenTaskAt(userId: string, petId: string, title: string, dueDate: Date) {
    const dayStart = new Date(dueDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const rows = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.petId, petId),
          eq(tasks.title, title),
          eq(tasks.isCompleted, false),
          gte(tasks.dueDate, dayStart),
          lt(tasks.dueDate, dayEnd),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  /**
   * Recurring tasks that are more than one period overdue. The recurrence job
   * rolls these forward so a neglected schedule catches up instead of burying
   * the user in overdue rows.
   */
  async listStaleRecurringTasks(before: Date, limit = 200) {
    return db
      .select({
        id: tasks.id,
        userId: tasks.userId,
        petId: tasks.petId,
        title: tasks.title,
        taskType: tasks.taskType,
        frequency: tasks.frequency,
        dueDate: tasks.dueDate,
        notes: tasks.notes,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.isCompleted, false),
          lt(tasks.dueDate, before),
          ne(tasks.frequency, 'none'),
          sql`${tasks.frequency} <> ''`,
        ),
      )
      .orderBy(asc(tasks.dueDate))
      .limit(limit);
  },

  /** Move a task to its next slot (used by the recurrence job). */
  async rollTaskDueDate(id: string, dueDate: Date) {
    const rows = await db
      .update(tasks)
      .set({ dueDate, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning({ id: tasks.id });
    return rows[0] ?? null;
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
