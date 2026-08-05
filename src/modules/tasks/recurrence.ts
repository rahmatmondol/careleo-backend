/**
 * Task recurrence.
 *
 * `tasks.frequency` has always been stored but never acted on, so a "daily"
 * feeding existed for exactly one day. These helpers turn that column into a
 * real schedule: completing a recurring task creates the next occurrence, and
 * a background job rolls missed ones forward instead of leaving a growing pile
 * of overdue rows.
 *
 * Frequencies are matched loosely because they arrive from three places — the
 * app, the AI care plan and the AI chat tools — with wording like "daily",
 * "Everyday", "weekly", "every week".
 */

export type Recurrence = 'daily' | 'weekly' | 'monthly' | 'none';

export function parseRecurrence(value: unknown): Recurrence {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v || v === 'none' || v === 'once' || v.includes('one time')) return 'none';
  if (v.includes('month')) return 'monthly';
  if (v.includes('week')) return 'weekly';
  if (v.includes('dai') || v.includes('every day') || v === 'everyday') return 'daily';
  return 'none';
}

/** One step forward from `date`, or null when the task does not repeat. */
export function stepOccurrence(date: Date, recurrence: Recurrence): Date | null {
  const next = new Date(date.getTime());
  switch (recurrence) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      return next;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      return next;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      return next;
    default:
      return null;
  }
}

/**
 * The first occurrence strictly after `now`, keeping the original time of day.
 * A pet left unattended for a month should get today's task, not thirty
 * backdated ones, so missed slots are skipped rather than replayed.
 */
export function nextOccurrenceAfter(
  dueDate: Date,
  frequency: unknown,
  now: Date = new Date(),
): Date | null {
  const recurrence = parseRecurrence(frequency);
  if (recurrence === 'none') return null;

  let next = stepOccurrence(dueDate, recurrence);
  if (!next) return null;

  // Cap the walk so a very old task can't spin here (daily over ~5 years).
  for (let i = 0; i < 2000 && next <= now; i++) {
    const step = stepOccurrence(next, recurrence);
    if (!step) return null;
    next = step;
  }
  return next > now ? next : null;
}

/** How long one period lasts, used to decide when a task counts as missed. */
export function periodMs(frequency: unknown): number | null {
  switch (parseRecurrence(frequency)) {
    case 'daily':
      return 24 * 60 * 60 * 1000;
    case 'weekly':
      return 7 * 24 * 60 * 60 * 1000;
    case 'monthly':
      return 30 * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}
