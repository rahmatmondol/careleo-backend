/**
 * Life-stage Milestone Job — runs every 6 hours.
 *
 * Owners are not expected to know that a puppy needs three vaccine rounds
 * before four months, that a dog is "senior" at seven, or that a cat's dental
 * check is overdue by three. The app knows the date of birth and the species,
 * so it can simply say so — once, at the right time, as a real task the owner
 * can tick off.
 *
 * Idempotent through `pet_milestones`: one row per (pet, milestone), forever.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/shared/db';
import { petMilestones, pets } from '@/shared/db/schema';
import { TasksModel } from '@/modules/tasks/model';
import { syncTaskSchedule } from '@/shared/queue';
import { sendProactive } from './shared/proactive';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Act on a milestone when it falls in this window around today. */
const LOOK_BEHIND_DAYS = 7;
const LOOK_AHEAD_DAYS = 21;

const MAX_PER_RUN = 100;

type Species = 'dog' | 'cat' | 'other';

type MilestoneRule = {
  key: string;
  title: string;
  /** Age in days at which it is due. */
  ageDays: number;
  taskType: string;
  species?: Species[];
  note: string;
};

/**
 * Deliberately conservative and non-prescriptive: these create a *reminder to
 * ask a vet*, never a medical instruction. Timings follow the common core
 * schedules; a vet's own plan always overrides them.
 */
const RULES: MilestoneRule[] = [
  { key: 'vaccine_round_1', title: 'First vaccination round', ageDays: 45, taskType: 'VACCINE', species: ['dog', 'cat'], note: 'the first core vaccination round is usually given around 6–8 weeks' },
  { key: 'vaccine_round_2', title: 'Second vaccination round', ageDays: 72, taskType: 'VACCINE', species: ['dog', 'cat'], note: 'the second round usually follows at about 10–12 weeks' },
  { key: 'vaccine_round_3', title: 'Third vaccination round', ageDays: 100, taskType: 'VACCINE', species: ['dog', 'cat'], note: 'the final puppy/kitten round and rabies are usually due around 14–16 weeks' },
  { key: 'neuter_consult', title: 'Talk to the vet about neutering', ageDays: 180, taskType: 'VET', species: ['dog', 'cat'], note: 'six months is the usual point to discuss neutering timing' },
  { key: 'first_booster', title: 'First annual booster', ageDays: 365, taskType: 'VACCINE', species: ['dog', 'cat'], note: 'the first annual booster falls due at one year' },
  { key: 'dental_check', title: 'First dental check', ageDays: 3 * 365, taskType: 'VET', note: 'dental disease is common — and quiet — from about three years old' },
  { key: 'senior_dog', title: 'Senior check-up', ageDays: 7 * 365, taskType: 'VET', species: ['dog'], note: 'dogs are considered senior around seven, when twice-yearly check-ups start to pay off' },
  { key: 'senior_cat', title: 'Senior check-up', ageDays: 10 * 365, taskType: 'VET', species: ['cat'], note: 'cats are considered senior around ten, when twice-yearly check-ups start to pay off' },
];

/** Yearly check-ups from year two onwards. */
const annualRules = (): MilestoneRule[] =>
  Array.from({ length: 18 }, (_, i) => i + 2).map((year) => ({
    key: `annual_checkup_${year}`,
    title: `Annual check-up (year ${year})`,
    ageDays: year * 365,
    taskType: 'VET',
    note: 'a yearly check-up keeps vaccinations and weight on track',
  }));

const speciesOf = (type: string | null): Species => {
  const value = String(type ?? '').toLowerCase();
  if (value.includes('dog') || value.includes('puppy')) return 'dog';
  if (value.includes('cat') || value.includes('kitten')) return 'cat';
  return 'other';
};

/** `dob` is free-text on `pets`; anything unparseable simply opts the pet out. */
const parseDob = (dob: string | null): Date | null => {
  const raw = String(dob ?? '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getTime() > Date.now()) return null;
  return date;
};

export type MilestoneOptions = { onlyUserId?: string; onlyPetId?: string };

export async function runMilestonesJob(opts: MilestoneOptions = {}) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - LOOK_BEHIND_DAYS * DAY_MS);
  const windowEnd = new Date(now.getTime() + LOOK_AHEAD_DAYS * DAY_MS);

  let allPets = await db
    .select({ id: pets.id, userId: pets.userId, name: pets.name, type: pets.type, dob: pets.dob })
    .from(pets);

  if (opts.onlyUserId) allPets = allPets.filter((p) => p.userId === opts.onlyUserId);
  if (opts.onlyPetId) allPets = allPets.filter((p) => p.id === opts.onlyPetId);

  const rules = [...RULES, ...annualRules()];

  let created = 0;
  for (const pet of allPets) {
    if (created >= MAX_PER_RUN) break;

    const dob = parseDob(pet.dob);
    if (!dob) continue;
    const species = speciesOf(pet.type);

    const applicable = rules.filter((rule) => {
      if (rule.species && !rule.species.includes(species)) return false;
      const dueAt = new Date(dob.getTime() + rule.ageDays * DAY_MS);
      return dueAt >= windowStart && dueAt <= windowEnd;
    });
    if (!applicable.length) continue;

    const existing = await db
      .select({ key: petMilestones.milestoneKey })
      .from(petMilestones)
      .where(
        and(
          eq(petMilestones.petId, pet.id),
          inArray(petMilestones.milestoneKey, applicable.map((r) => r.key)),
        ),
      );
    const seen = new Set(existing.map((r) => r.key));

    for (const rule of applicable) {
      if (seen.has(rule.key)) continue;

      // Never in the past: an owner who joined late should get "this week",
      // not a task that is already overdue the moment it appears.
      const naturalDue = new Date(dob.getTime() + rule.ageDays * DAY_MS);
      const dueAt = naturalDue < now ? new Date(now.getTime() + 2 * DAY_MS) : naturalDue;

      // The ledger row is the lock — write it before anything else, and let a
      // duplicate insert lose quietly.
      try {
        await db.insert(petMilestones).values({
          petId: pet.id,
          milestoneKey: rule.key,
          title: rule.title,
          dueAt,
        });
      } catch {
        continue;
      }

      const task = await TasksModel.createTask({
        userId: pet.userId,
        petId: pet.id,
        title: `${rule.title} — ${pet.name}`,
        taskType: rule.taskType,
        frequency: 'none',
        dueDate: dueAt,
        notes: `Suggested by Careleo: ${rule.note}. Your vet's own schedule takes precedence.`,
      });

      if (task) {
        try {
          await syncTaskSchedule(pet.userId, dueAt);
        } catch {}
      }

      await sendProactive({
        userId: pet.userId,
        petId: pet.id,
        messageType: 'milestone',
        message: `${pet.name}-এর জন্য একটা milestone এসেছে: **${rule.title}**. কারণ — ${rule.note}. আমি তোমার task list-এ যোগ করে দিয়েছি; চাইলে vet appointment-ও দেখে দিতে পারি।`,
        pushTitle: `${pet.name}: ${rule.title}`,
        pushBody: rule.note,
        type: 'HEALTH_ALERT',
        priority: 'normal',
        data: { event: 'milestone', petId: pet.id, milestone: rule.key },
      });

      created++;
    }
  }

  return { created, pets: allPets.length };
}
