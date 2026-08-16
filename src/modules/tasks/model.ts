import { and, asc, eq, gte, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import { petCaregivers, pets, tasks, users } from '@/shared/db/schema';

/**
 * A task is "open" when it is neither done nor deliberately skipped.
 *
 * Every reminder, escalation and overdue sweep keys off this — a skipped dose
 * must stop nagging exactly like a completed one, while still being a different
 * thing in the record.
 */
export const isOpenTask = () => and(eq(tasks.isCompleted, false), isNull(tasks.skippedAt));

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

  /**
   * Pets this person may act on: their own, plus any they were accepted as a
   * caregiver for. Used to let a co-owner tick off the dose they just gave.
   */
  async accessiblePetIds(userId: string): Promise<string[]> {
    const [owned, helping] = await Promise.all([
      db.select({ id: pets.id }).from(pets).where(eq(pets.userId, userId)),
      db
        .select({ id: petCaregivers.petId })
        .from(petCaregivers)
        .where(and(eq(petCaregivers.userId, userId), eq(petCaregivers.status, 'accepted'))),
    ]);
    return [...new Set([...owned.map((r) => r.id), ...helping.map((r) => r.id)])];
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

  /**
   * Tasks the user can see: their own, plus those of pets they help with.
   *
   * Ordered the way a to-do list is read — soonest first, and anything already
   * settled (done or skipped) after everything still outstanding. It used to be
   * `desc(dueDate)`, which put tonight's task above this morning's.
   */
  async listTasks(userId: string, petId?: string) {
    const accessible = await this.accessiblePetIds(userId);

    const scope = petId
      ? accessible.includes(petId)
        ? eq(tasks.petId, petId)
        : // Not theirs to see — fall back to their own rows for that pet, which
          // returns nothing rather than leaking somebody else's schedule.
          and(eq(tasks.userId, userId), eq(tasks.petId, petId))
      : accessible.length
        ? or(eq(tasks.userId, userId), inArray(tasks.petId, accessible))
        : eq(tasks.userId, userId);

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
        completedAt: tasks.completedAt,
        completedBy: tasks.completedBy,
        completedByName: users.firstName,
        skippedAt: tasks.skippedAt,
        skipReason: tasks.skipReason,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .innerJoin(pets, eq(tasks.petId, pets.id))
      .leftJoin(users, eq(tasks.completedBy, users.id))
      .where(scope)
      .orderBy(
        // Outstanding work first, then the settled rows.
        sql`(${tasks.isCompleted} OR ${tasks.skippedAt} IS NOT NULL)`,
        asc(tasks.dueDate),
        asc(tasks.createdAt),
      );
  },

  /** Get one task by id, for anyone allowed to act on it. */
  async getTask(userId: string, id: string) {
    const accessible = await this.accessiblePetIds(userId);
    const scope = accessible.length
      ? or(eq(tasks.userId, userId), inArray(tasks.petId, accessible))
      : eq(tasks.userId, userId);

    const rows = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), scope))
      .limit(1);
    return rows[0] ?? null;
  },

  /** Get one task the user *owns* — for edits only the owner may make. */
  async getOwnedTask(userId: string, id: string) {
    const rows = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .limit(1);
    return rows[0] ?? null;
  },

  /** Update one task by id. Scope is decided by the caller. */
  async updateTask(
    id: string,
    payload: Partial<{
      title: string;
      taskType: string;
      frequency: string;
      dueDate: Date;
      notes: string;
      isCompleted: boolean;
      completedAt: Date | null;
      completedBy: string | null;
      skippedAt: Date | null;
      skipReason: string | null;
    }>,
  ) {
    const rows = await db
      .update(tasks)
      .set({ ...payload, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return rows[0] ?? null;
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
          isOpenTask(),
          gte(tasks.dueDate, dayStart),
          lt(tasks.dueDate, dayEnd),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  /**
   * The untouched future occurrence a completion spawned.
   *
   * Un-completing has to take it back, or undoing a mis-tap leaves tomorrow's
   * task sitting there as a duplicate of one that never happened.
   */
  async findSpawnedOccurrence(userId: string, petId: string, title: string, after: Date) {
    const rows = await db
      .select({ id: tasks.id, dueDate: tasks.dueDate })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.petId, petId),
          eq(tasks.title, title),
          isOpenTask(),
          gte(tasks.dueDate, after),
        ),
      )
      .orderBy(asc(tasks.dueDate))
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
          isOpenTask(),
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
      // `dueDate` comes back so the caller can recompute the notification slot
      // the task just vacated — the row is gone by then.
      .returning({ id: tasks.id, dueDate: tasks.dueDate });
    return rows[0] ?? null;
  },

  /** Remove a spawned occurrence when its parent completion is undone. */
  async deleteById(id: string) {
    const rows = await db.delete(tasks).where(eq(tasks.id, id)).returning({ id: tasks.id, dueDate: tasks.dueDate });
    return rows[0] ?? null;
  },

  /** Open tasks in a window — backs "mark the whole morning done". */
  async listOpenTasksBetween(userId: string, from: Date, to: Date, petId?: string) {
    const accessible = await this.accessiblePetIds(userId);
    const scope = accessible.length
      ? or(eq(tasks.userId, userId), inArray(tasks.petId, accessible))
      : eq(tasks.userId, userId);

    const conditions = [scope, isOpenTask(), gte(tasks.dueDate, from), lt(tasks.dueDate, to)];
    if (petId) conditions.push(eq(tasks.petId, petId));

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
      .where(and(...conditions))
      .orderBy(asc(tasks.dueDate));
  },
};
