/**
 * Weekly Care Report Job — runs hourly, sends once a week per user.
 *
 * Everything else the app sends is a demand: do this, you missed that. This is
 * the one message that reports back — what got done, how the streak is going,
 * where the week slipped. It is the difference between an app that nags and one
 * that is on the owner's side, and it doubles as the medication-adherence
 * number a vet will ask for.
 *
 * Sent on the user's chosen weekday morning, in their timezone.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/shared/db';
import { pets, users } from '@/shared/db/schema';
import { can } from '@/modules/subscriptions/entitlements';
import { AiService } from '@/modules/ai/service';
import { CareInsights, type PetCareStats } from '@/modules/care/insights';
import { FALLBACK_TZ } from '@/modules/notifications/preferences';
import { hourInZone } from '@/shared/types/timezone';
import { sendProactive, sentWithin } from './shared/proactive';

/** Sunday morning: the week is over and the next one hasn't started. */
const REPORT_WEEKDAY = 0;
const REPORT_HOUR = 10;
const MAX_PER_RUN = 100;

export type WeeklyReportOptions = {
  onlyUserId?: string;
  /** Skip the day/hour gate (testing). */
  ignoreSchedule?: boolean;
};

const weekdayInZone = (timeZone: string, at: Date): number => {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(at);
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
  } catch {
    return at.getDay();
  }
};

export async function runWeeklyReportJob(opts: WeeklyReportOptions = {}) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 6.5 * 24 * 60 * 60 * 1000);

  let owners = await db.selectDistinct({ userId: pets.userId }).from(pets);
  if (opts.onlyUserId) owners = owners.filter((o) => o.userId === opts.onlyUserId);

  let sent = 0;
  for (const { userId } of owners) {
    if (sent >= MAX_PER_RUN) break;
    if (!(await can(userId, 'ai_chat'))) continue;

    if (!opts.ignoreSchedule) {
      const [user] = await db.select({ tz: users.timezone }).from(users).where(eq(users.id, userId)).limit(1);
      const timeZone = user?.tz || FALLBACK_TZ;
      if (weekdayInZone(timeZone, now) !== REPORT_WEEKDAY) continue;
      if (hourInZone(timeZone, now) !== REPORT_HOUR) continue;
    }

    // Slightly under a week, so a clock drift can't skip a whole cycle.
    if (await sentWithin(userId, 'weekly_review', weekAgo)) continue;

    const summary = await CareInsights.summary(userId, { days: 7 });
    // A week with nothing scheduled has nothing to report on.
    if (!summary.totals.total) continue;

    const headline = summary.pets.map(describePet).join(' ');
    const fallback = `গত সপ্তাহের হিসাব: ${summary.totals.completed}/${summary.totals.total} কাজ শেষ (${summary.totals.completionRate}%)। ${headline}`;

    const message = await AiService.generateProactiveMessage({
      userId,
      petId: summary.pets[0]?.petId,
      feature: 'weekly_review',
      fallback,
      task: `Write ONE short weekly care summary for the owner. The facts: ${summary.totals.completed} of ${summary.totals.total} care tasks were completed (${summary.totals.completionRate}%). Per pet: ${summary.pets.map(describePetForModel).join(' | ')}. Lead with what went well, name at most one thing worth improving, and do not scold. If a medication adherence figure is present, mention it plainly.`,
    });

    await sendProactive({
      userId,
      petId: summary.pets[0]?.petId ?? null,
      messageType: 'weekly_review',
      message,
      pushTitle: 'Your week in pet care',
      pushBody: `${summary.totals.completed}/${summary.totals.total} tasks done (${summary.totals.completionRate}%)`,
      type: 'AI_ASSISTANT',
      priority: 'low',
      data: { event: 'weekly_report' },
    });

    sent++;
  }

  return { sent, owners: owners.length };
}

const describePet = (pet: PetCareStats): string => {
  const bits = [`${pet.petName}: ${pet.completed}/${pet.total}`];
  if (pet.streakDays > 1) bits.push(`${pet.streakDays} দিনের streak`);
  if (pet.medicationAdherence !== null) bits.push(`ওষুধ ${pet.medicationAdherence}%`);
  return `${bits.join(', ')}.`;
};

const describePetForModel = (pet: PetCareStats): string => {
  const bits = [
    `${pet.petName} completed ${pet.completed}/${pet.total} (${pet.completionRate}%)`,
    `${pet.onTime} on time`,
    `streak ${pet.streakDays} days`,
  ];
  if (pet.medicationAdherence !== null) {
    bits.push(`medication adherence ${pet.medicationAdherence}% over ${pet.medicationTotal} doses`);
  }
  if (pet.weakSpots.length) {
    bits.push(`most missed: ${pet.weakSpots.map((w) => `${w.title} (${w.missed}x)`).join(', ')}`);
  }
  return bits.join(', ');
};
