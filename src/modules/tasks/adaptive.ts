/**
 * Adaptive reminder timing.
 *
 * A schedule the owner never keeps is a schedule that is wrong, not an owner
 * who is careless. If "morning walk" is set for 07:00 but happens at 07:50 nine
 * times out of ten, the reminder should move — otherwise every single day
 * produces a late notification and an overdue row for something that actually
 * got done.
 *
 * So: measure the gap between due time and completion, and once the pattern is
 * unmistakable, shift the *next* occurrence of a recurring task by it. Nothing
 * is moved on the strength of one or two data points, and nothing moves more
 * than a few hours.
 */

import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import { tasks } from '@/shared/db/schema';

/** Completions needed before a pattern counts as real. */
const MIN_SAMPLES = 5;
/** Below this the drift isn't worth acting on. */
const MIN_SHIFT_MINUTES = 15;
/** Never move a task more than this in one step. */
const MAX_SHIFT_MINUTES = 180;
/** How many recent completions to look at. */
const WINDOW = 10;

export type TimingInsight = {
  samples: number;
  medianOffsetMinutes: number;
  /** The shift that would actually be applied — 0 when the pattern is too weak. */
  suggestedShiftMinutes: number;
};

const median = (values: number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

/**
 * How late (positive) or early (negative) this owner tends to be with this
 * particular task, in minutes.
 *
 * Matched on title + pet, because "give medicine" for one pet and "give
 * medicine" for another are different routines with different realities.
 */
export const timingInsightFor = async (
  userId: string,
  petId: string | null,
  title: string,
): Promise<TimingInsight> => {
  const conditions = [
    eq(tasks.userId, userId),
    eq(tasks.title, title),
    eq(tasks.isCompleted, true),
    isNotNull(tasks.completedAt),
  ];
  if (petId) conditions.push(eq(tasks.petId, petId));

  const rows = await db
    .select({
      offset: sql<number>`EXTRACT(EPOCH FROM (${tasks.completedAt} - ${tasks.dueDate})) / 60`,
    })
    .from(tasks)
    .where(and(...conditions))
    .orderBy(desc(tasks.completedAt))
    .limit(WINDOW);

  const offsets = rows
    .map((r) => Math.round(Number(r.offset)))
    // A "completion" days after the fact is catch-up, not routine — it would
    // drag the median into nonsense.
    .filter((n) => Number.isFinite(n) && Math.abs(n) <= 12 * 60);

  if (offsets.length < MIN_SAMPLES) {
    return { samples: offsets.length, medianOffsetMinutes: 0, suggestedShiftMinutes: 0 };
  }

  const medianOffset = median(offsets);
  const shift =
    Math.abs(medianOffset) < MIN_SHIFT_MINUTES
      ? 0
      : Math.max(-MAX_SHIFT_MINUTES, Math.min(MAX_SHIFT_MINUTES, medianOffset));

  return { samples: offsets.length, medianOffsetMinutes: medianOffset, suggestedShiftMinutes: shift };
};

/**
 * Apply the learned drift to a task's next due time.
 *
 * Self-correcting: once the schedule has moved to where the owner actually is,
 * the measured offset collapses towards zero and it stops moving.
 */
export const adaptDueDate = async (
  userId: string,
  petId: string | null,
  title: string,
  nextDue: Date,
): Promise<{ dueDate: Date; shiftedMinutes: number }> => {
  try {
    const insight = await timingInsightFor(userId, petId, title);
    if (!insight.suggestedShiftMinutes) return { dueDate: nextDue, shiftedMinutes: 0 };
    return {
      dueDate: new Date(nextDue.getTime() + insight.suggestedShiftMinutes * 60_000),
      shiftedMinutes: insight.suggestedShiftMinutes,
    };
  } catch {
    // Learning is an optimisation; never let it break task creation.
    return { dueDate: nextDue, shiftedMinutes: 0 };
  }
};
