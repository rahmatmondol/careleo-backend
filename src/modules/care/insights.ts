/**
 * Care insights: what actually happened, per pet, over a window.
 *
 * The app has always known which tasks exist; it has never been able to tell an
 * owner "you gave 27 of 30 doses on time, and the two you missed were both
 * Sunday evenings". That is the number a vet asks for and the number an owner
 * can act on, so it is computed here from `tasks.completedAt` and reused by the
 * weekly report, the medication adherence view, and the API.
 */

import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { db } from '@/shared/db';
import { pets, tasks, users } from '@/shared/db/schema';
import { FALLBACK_TZ, priorityForTaskType } from '@/modules/notifications/preferences';

/** Completed within this long after the due time still counts as "on time". */
const ON_TIME_GRACE_MIN = 60;

export type PetCareStats = {
  petId: string;
  petName: string;
  total: number;
  completed: number;
  onTime: number;
  missed: number;
  completionRate: number;
  /** Of medication/vaccine tasks only — null when the pet has none. */
  medicationAdherence: number | null;
  medicationTotal: number;
  /** Consecutive days, ending today, with nothing left undone. */
  streakDays: number;
  /** Deliberately skipped — excluded from the rates, not counted as misses. */
  skipped: number;
  /** Titles that go undone most often, worst first. */
  weakSpots: Array<{ title: string; missed: number }>;
};

export type CareSummary = {
  from: string;
  to: string;
  days: number;
  pets: PetCareStats[];
  totals: { total: number; completed: number; onTime: number; skipped: number; completionRate: number };
};

type TaskRow = {
  id: string;
  petId: string | null;
  petName: string | null;
  title: string;
  taskType: string | null;
  dueDate: Date;
  isCompleted: boolean;
  completedAt: Date | null;
  skippedAt: Date | null;
};

const rate = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

/** Local calendar day (`YYYY-MM-DD`) of an instant, in the given zone. */
const dayKey = (date: Date, timeZone: string): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
};

const isOnTime = (task: TaskRow) =>
  Boolean(task.completedAt) &&
  task.completedAt!.getTime() <= task.dueDate.getTime() + ON_TIME_GRACE_MIN * 60_000;

/**
 * Days in a row, counting back from today, on which every task due was done.
 *
 * Today is skipped when it still has open tasks — the day isn't over, so it
 * would be unfair to call the streak broken.
 */
const computeStreak = (rows: TaskRow[], timeZone: string, now: Date): number => {
  const byDay = new Map<string, { total: number; done: number }>();
  for (const row of rows) {
    const key = dayKey(row.dueDate, timeZone);
    const bucket = byDay.get(key) ?? { total: 0, done: 0 };
    bucket.total++;
    if (row.isCompleted) bucket.done++;
    byDay.set(key, bucket);
  }

  let streak = 0;
  for (let back = 0; back < 366; back++) {
    const day = new Date(now.getTime() - back * 24 * 60 * 60 * 1000);
    const bucket = byDay.get(dayKey(day, timeZone));
    if (!bucket) {
      // No tasks that day breaks nothing, but it does not extend the streak
      // either — keep walking back.
      if (back === 0) continue;
      break;
    }
    const perfect = bucket.done === bucket.total;
    if (!perfect) {
      if (back === 0) continue; // today is still in progress
      break;
    }
    streak++;
  }
  return streak;
};

export const CareInsights = {
  async summary(userId: string, opts: { days?: number; petId?: string } = {}): Promise<CareSummary> {
    const days = Math.min(365, Math.max(1, Math.floor(opts.days ?? 7)));
    const now = new Date();
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const [user] = await db.select({ tz: users.timezone }).from(users).where(eq(users.id, userId)).limit(1);
    const timeZone = user?.tz || FALLBACK_TZ;

    const conditions = [eq(tasks.userId, userId), gte(tasks.dueDate, from), lte(tasks.dueDate, now)];
    if (opts.petId) conditions.push(eq(tasks.petId, opts.petId));

    const rows = (await db
      .select({
        id: tasks.id,
        petId: tasks.petId,
        petName: pets.name,
        title: tasks.title,
        taskType: tasks.taskType,
        dueDate: tasks.dueDate,
        isCompleted: tasks.isCompleted,
        completedAt: tasks.completedAt,
        skippedAt: tasks.skippedAt,
      })
      .from(tasks)
      .leftJoin(pets, eq(tasks.petId, pets.id))
      .where(and(...conditions))
      .orderBy(asc(tasks.dueDate))) as unknown as TaskRow[];

    const byPet = new Map<string, TaskRow[]>();
    for (const row of rows) {
      if (!row.petId) continue;
      const list = byPet.get(row.petId) ?? [];
      list.push({
        ...row,
        dueDate: new Date(row.dueDate),
        completedAt: row.completedAt ? new Date(row.completedAt) : null,
      });
      byPet.set(row.petId, list);
    }

    const petStats: PetCareStats[] = [...byPet.entries()].map(([petId, list]) => {
      const skipped = list.filter((t) => Boolean(t.skippedAt) && !t.isCompleted);
      // A dose the vet told them to skip is not a dose they missed, so it is
      // taken out of the denominator entirely rather than scored either way.
      const counted = list.filter((t) => !t.skippedAt || t.isCompleted);
      const completed = counted.filter((t) => t.isCompleted);
      const onTime = completed.filter(isOnTime);
      const medication = counted.filter((t) => priorityForTaskType(t.taskType) === 'critical');
      const medicationDone = medication.filter((t) => t.isCompleted && isOnTime(t));

      const missedByTitle = new Map<string, number>();
      for (const task of counted) {
        if (task.isCompleted) continue;
        missedByTitle.set(task.title, (missedByTitle.get(task.title) ?? 0) + 1);
      }

      return {
        petId,
        petName: list[0].petName ?? 'Your pet',
        total: counted.length,
        completed: completed.length,
        onTime: onTime.length,
        missed: counted.length - completed.length,
        skipped: skipped.length,
        completionRate: rate(completed.length, counted.length),
        medicationAdherence: medication.length ? rate(medicationDone.length, medication.length) : null,
        medicationTotal: medication.length,
        streakDays: computeStreak(counted, timeZone, now),
        weakSpots: [...missedByTitle.entries()]
          .map(([title, missed]) => ({ title, missed }))
          .sort((a, b) => b.missed - a.missed)
          .slice(0, 3),
      };
    });

    const countedAll = rows.filter((r) => !r.skippedAt || r.isCompleted);
    const total = countedAll.length;
    const completedAll = countedAll.filter((r) => r.isCompleted).length;
    const onTimeAll = countedAll.filter(
      (r) =>
        r.isCompleted &&
        isOnTime({
          ...r,
          dueDate: new Date(r.dueDate),
          completedAt: r.completedAt ? new Date(r.completedAt) : null,
        }),
    ).length;

    return {
      from: from.toISOString(),
      to: now.toISOString(),
      days,
      pets: petStats.sort((a, b) => b.total - a.total),
      totals: {
        total,
        completed: completedAll,
        onTime: onTimeAll,
        skipped: rows.length - countedAll.length,
        completionRate: rate(completedAll, total),
      },
    };
  },

  /** Medication view on its own — the one a vet actually asks about. */
  async medicationAdherence(userId: string, opts: { days?: number; petId?: string } = {}) {
    const summary = await this.summary(userId, { days: opts.days ?? 30, petId: opts.petId });
    return {
      days: summary.days,
      pets: summary.pets
        .filter((p) => p.medicationTotal > 0)
        .map((p) => ({
          petId: p.petId,
          petName: p.petName,
          doses: p.medicationTotal,
          adherence: p.medicationAdherence,
        })),
    };
  },
};
