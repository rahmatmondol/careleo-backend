import { AiModel } from './model';
import { TasksService } from '../tasks/service';
import { RemindersService } from '../reminders/service';
import { PetProfileModel } from '@/modules/pet-profile/model';
import { getModelForPurpose, recordTokenUsage } from './model-registry';
import { generateText } from './generate';
import { getPreferenceContext } from '@/modules/notifications/preferences';
import { dayKeyPlusDays, nextZonedSlot } from '@/shared/types/timezone';

// ─── Care plan types ──────────────────────────────────────────────────────

export type ScheduleItem = {
  time: string;          // e.g. "07:00"
  task: string;          // e.g. "Morning feeding"
  taskType: string;      // FEEDING | EXERCISE | MEDICINE | GROOMING | OTHER
  frequency: string;     // daily | weekly | none
  duration?: string;     // e.g. "30 min" for walks
  amount?: string;       // e.g. "1 cup" for food
  notes?: string;
};

export type VaccineItem = { vaccine: string; due_in_days: number };

export type CarePlan = {
  daily_schedule: ScheduleItem[];
  health_alerts: string[];
  upcoming_vaccines: VaccineItem[];
  product_recommendations: { category: string; reason: string; query: string }[];
  weekly_goals: string[];
};

/**
 * What the plan is built from. The profile + learned facts are the Phase 2
 * memory store; the legacy `pet_preferences` row is still read as a fallback
 * for pets onboarded before that existed.
 */
function buildCarePlanPrompt(pet: any, prefs: any, profile: any, facts: { fact: string }[]): string {
  const preferenceData = prefs?.preferenceJson ? (() => {
    try { return JSON.parse(prefs.preferenceJson); } catch { return {}; }
  })() : {};

  const list = (value: unknown): string => {
    if (Array.isArray(value)) return value.length ? value.join(', ') : '';
    return value ? String(value) : '';
  };

  const dietType = profile?.dietType || prefs?.dietType || preferenceData.diet_type || preferenceData.food?.type || 'unknown';
  const dietBrand = profile?.dietBrand || preferenceData.diet_brand || '';
  const dailyAmount = profile?.dailyAmount || preferenceData.daily_amount || '';
  const activityLevel = profile?.activityLevel || prefs?.activityLevel || preferenceData.activity_level || 'moderate';
  const allergies = list(profile?.allergies) || list(preferenceData.allergies) || 'None';
  const conditions = list(profile?.healthConditions) || list(prefs?.healthConditions) || list(preferenceData.health_conditions) || 'None';
  const medications = list(profile?.medications) || 'None';
  const vaccination = profile?.vaccinationStatus || preferenceData.vaccination || 'Unknown';
  const grooming = profile?.groomingNotes || '';
  const behaviour = profile?.behaviorNotes || '';

  const factLines = facts.length
    ? `\nWHAT THE OWNER HAS TOLD US:\n${facts.map((f) => `- ${f.fact}`).join('\n')}`
    : '';

  return `You are a veterinary expert. Create a personalized daily care plan for this pet.

PET DETAILS:
- Name: ${pet.name}
- Type: ${pet.type}
- Breed: ${pet.breed ?? 'Unknown'}
- Gender: ${pet.gender ?? 'Unknown'}
- Date of Birth: ${pet.dob ?? 'Unknown'}
- Weight: ${pet.weight ?? 'Unknown'} kg
- Color: ${pet.color ?? 'Unknown'}

HEALTH & PREFERENCES:
- Diet Type: ${dietType}${dietBrand ? ` (brand: ${dietBrand})` : ''}
- Daily Amount: ${dailyAmount || 'unknown'}
- Activity Level: ${activityLevel}
- Known Allergies: ${allergies}
- Health Conditions: ${conditions}
- Medications: ${medications}
- Vaccination Status: ${vaccination}
${grooming ? `- Grooming: ${grooming}\n` : ''}${behaviour ? `- Behaviour: ${behaviour}\n` : ''}${factLines}

Generate a JSON care plan with this EXACT structure:
{
  "daily_schedule": [
    {
      "time": "HH:MM",
      "task": "task description",
      "taskType": "FEEDING" | "EXERCISE" | "MEDICINE" | "GROOMING" | "OTHER",
      "frequency": "daily" | "weekly" | "none",
      "duration": "optional, e.g. 30 min",
      "amount": "optional, e.g. 1 cup",
      "notes": "optional breed-specific note"
    }
  ],
  "health_alerts": [
    "One sentence alert about a health concern based on pet data"
  ],
  "upcoming_vaccines": [
    { "vaccine": "vaccine name", "due_in_days": 30 }
  ],
  "product_recommendations": [
    {
      "category": "food" | "supplement" | "toy" | "medicine" | "accessory",
      "reason": "Why this product is needed",
      "query": "search query for the store e.g. low_calorie_large_breed_food"
    }
  ],
  "weekly_goals": [
    "One measurable weekly goal for this pet's health"
  ]
}

Include 4-6 daily schedule items, 1-3 health alerts, and 2-4 product recommendations.
Use ordinary waking hours (06:00-22:00) — the owner will adjust the exact times.
Never schedule anything the pet is allergic to, and account for its health conditions and medication.
Make everything specific to this pet's breed, weight, and health conditions.
Return ONLY valid JSON. No markdown, no extra text.`;
}


export const CarePlanService = {
  /**
   * Generate a plan for a pet.
   *
   * By default this is a **preview**: the plan is saved as the pet's active
   * plan but no tasks or reminders are created, so the app can show it for
   * review first. Pass `apply: true` for the old behaviour (used by the AI
   * chat tool, where the user asked for it conversationally).
   */
  async generate(userId: string, petId: string, opts: { apply?: boolean } = {}): Promise<CarePlan> {
    const petData = await AiModel.getPetWithPreferences(petId);
    if (!petData) throw new Error('Pet not found');

    const { pet, prefs } = petData;
    const profile = await PetProfileModel.getProfile(petId);
    const facts = await PetProfileModel.listFacts(petId, { activeOnly: true, limit: 15 });

    // Load dynamic model from admin config
    const resolved = await getModelForPurpose('care_plan');
    const prompt = buildCarePlanPrompt(pet, prefs, profile, facts);

    // Was a hand-rolled copy of the same three-provider switch, with usage
    // defaulting to invented 800/600 counts when a provider reported none.
    const { text, inputTokens, outputTokens } = await generateText(resolved, prompt, 2048);

    await recordTokenUsage({ userId, petId, model: resolved, feature: 'care_plan', inputTokens, outputTokens });

    // Parse care plan
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const carePlan: CarePlan = JSON.parse(cleaned);

    // Save care plan to DB
    await AiModel.savePetCarePlan(petId, JSON.stringify(carePlan), resolved.modelName);

    if (opts.apply) {
      await CarePlanService.apply(userId, petId, carePlan);
    }

    return carePlan;
  },

  /**
   * Turn an approved plan into real tasks and reminders.
   *
   * Split out from `generate` so the app can show the plan for review first —
   * a user who deletes a suggested item should never find it already sitting
   * in their task list. Whatever is passed here is what gets created, and it
   * is stored as the pet's active plan so the two never drift apart.
   */
  async apply(
    userId: string,
    petId: string,
    plan: Partial<CarePlan> & { daily_schedule?: ScheduleItem[]; upcoming_vaccines?: VaccineItem[] },
  ) {
    const petData = await AiModel.getPetWithPreferences(petId);
    if (!petData) throw new Error('Pet not found');
    const { pet } = petData;

    const schedule = plan.daily_schedule ?? [];
    const vaccines = plan.upcoming_vaccines ?? [];

    // A plan's times are wall-clock times on the *owner's* clock ("07:00
    // feeding"), so they have to be resolved in the owner's zone. They used to
    // be built from the server's, which is an accident of deployment: on a UTC
    // host a 07:00 feeding became 13:00 for an owner in Dhaka, and the "that
    // time already passed, use tomorrow" decision was made on the wrong clock
    // as well.
    const { timezone } = await getPreferenceContext(userId);

    let tasksCreated = 0;
    for (const item of schedule) {
      try {
        await TasksService.create(userId, {
          petId,
          title: item.task,
          taskType: item.taskType ?? 'OTHER',
          frequency: item.frequency ?? 'daily',
          dueDate: nextZonedSlot(timezone, item.time).toISOString(),
          notes: [item.notes, item.amount, item.duration].filter(Boolean).join(' | '),
        });
        tasksCreated++;
      } catch {
        // Skip individual task failures — don't abort the whole plan
      }
    }

    let remindersCreated = 0;
    for (const vax of vaccines) {
      if (vax.due_in_days == null || vax.due_in_days > 60) continue;
      try {
        await RemindersService.create(userId, {
          petId,
          title: `${pet.name} — ${vax.vaccine} vaccine due`,
          reminderType: 'health',
          // The reminder scheduler expects a plain date + HH:MM, not an ISO
          // timestamp — an ISO string here silently never fired. The date is
          // counted on the owner's calendar, not the server's.
          reminderDate: dayKeyPlusDays(timezone, vax.due_in_days),
          reminderTime: '09:00',
          frequency: 'once',
          notes: `Upcoming vaccine: ${vax.vaccine}`,
        });
        remindersCreated++;
      } catch {
        // Skip if reminder creation fails
      }
    }

    // Persist exactly what the user approved, merged over the generated plan.
    const active = await AiModel.getActivePetCarePlan(petId);
    const previous = (() => {
      try { return active?.planJson ? JSON.parse(active.planJson) : {}; } catch { return {}; }
    })();
    const merged = { ...previous, ...plan, daily_schedule: schedule, upcoming_vaccines: vaccines };
    await AiModel.savePetCarePlan(petId, JSON.stringify(merged), active?.generatedBy ?? 'user-edited');

    return { tasksCreated, remindersCreated, carePlan: merged as CarePlan };
  },
};
