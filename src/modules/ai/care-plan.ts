import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { AiModel } from './model';
import { TasksService } from '../tasks/service';
import { RemindersService } from '../reminders/service';
import { getModelForPurpose, recordTokenUsage } from './model-registry';

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

export type CarePlan = {
  daily_schedule: ScheduleItem[];
  health_alerts: string[];
  upcoming_vaccines: { vaccine: string; due_in_days: number }[];
  product_recommendations: { category: string; reason: string; query: string }[];
  weekly_goals: string[];
};

function buildCarePlanPrompt(pet: any, prefs: any): string {
  const preferenceData = prefs?.preferenceJson ? (() => {
    try { return JSON.parse(prefs.preferenceJson); } catch { return {}; }
  })() : {};

  const weightStatus = preferenceData.weight?.status ?? 'unknown';
  const foodType = prefs?.dietType ?? preferenceData.food?.type ?? 'unknown';
  const activityLevel = prefs?.activityLevel ?? preferenceData.activity_level ?? 'moderate';
  const allergies = preferenceData.allergies ?? [];
  const conditions = prefs?.healthConditions ?? preferenceData.medical_conditions ?? 'none';
  const vaccines = preferenceData.vaccines ?? [];

  return `You are a veterinary expert. Create a personalized daily care plan for this pet.

PET DETAILS:
- Name: ${pet.name}
- Type: ${pet.type}
- Breed: ${pet.breed ?? 'Unknown'}
- Gender: ${pet.gender ?? 'Unknown'}
- Date of Birth: ${pet.dob ?? 'Unknown'}
- Weight: ${pet.weight ?? 'Unknown'} kg (Status: ${weightStatus})
- Color: ${pet.color ?? 'Unknown'}

HEALTH & PREFERENCES:
- Diet Type: ${foodType}
- Activity Level: ${activityLevel}
- Known Allergies: ${allergies.length > 0 ? allergies.join(', ') : 'None'}
- Medical Conditions: ${conditions}
- Vaccines Given: ${vaccines.length > 0 ? vaccines.join(', ') : 'Unknown'}

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
Make everything specific to this pet's breed, weight, and health conditions.
Return ONLY valid JSON. No markdown, no extra text.`;
}

export const CarePlanService = {
  async generate(userId: string, petId: string): Promise<CarePlan> {
    // Fetch pet data
    const petData = await AiModel.getPetWithPreferences(petId);
    if (!petData) throw new Error('Pet not found');

    const { pet, prefs } = petData;

    // Load dynamic model from admin config
    const resolved = await getModelForPurpose('care_plan');
    const prompt = buildCarePlanPrompt(pet, prefs);

    let text = '';
    let inputTokens = 800;
    let outputTokens = 600;

    if (resolved.provider === 'openai' || resolved.provider === 'deepseek' || resolved.provider === 'openai_custom') {
      const client = new OpenAI({ apiKey: resolved.apiKey, baseURL: resolved.baseUrl ?? undefined });
      const res = await client.chat.completions.create({
        model: resolved.modelName,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2048,
      });
      text = res.choices[0]?.message?.content ?? '';
      inputTokens = res.usage?.prompt_tokens ?? 800;
      outputTokens = res.usage?.completion_tokens ?? 600;

    } else if (resolved.provider === 'anthropic' || resolved.provider === 'anthropic_custom') {
      const client = new Anthropic({ apiKey: resolved.apiKey, ...(resolved.baseUrl && { baseURL: resolved.baseUrl }) });
      const res = await client.messages.create({
        model: resolved.modelName,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      });
      text = (res.content[0] as any).text ?? '';
      inputTokens = res.usage?.input_tokens ?? 800;
      outputTokens = res.usage?.output_tokens ?? 600;

    } else {
      // Google Gemini (default)
      const genAI = new GoogleGenerativeAI(resolved.apiKey);
      const model = genAI.getGenerativeModel({ model: resolved.modelName });
      const result = await model.generateContent(prompt);
      text = result.response.text();
      inputTokens = result.response.usageMetadata?.promptTokenCount ?? 800;
      outputTokens = result.response.usageMetadata?.candidatesTokenCount ?? 600;
    }

    await recordTokenUsage({ userId, petId, model: resolved, feature: 'care_plan', inputTokens, outputTokens });

    // Parse care plan
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const carePlan: CarePlan = JSON.parse(cleaned);

    // Save care plan to DB
    await AiModel.savePetCarePlan(petId, JSON.stringify(carePlan), resolved.modelName);

    // Auto-create tasks from daily_schedule
    let tasksCreated = 0;
    for (const item of carePlan.daily_schedule ?? []) {
      try {
        // Parse time to build today's dueDate
        const [hours, minutes] = (item.time ?? '08:00').split(':').map(Number);
        const dueDate = new Date();
        dueDate.setHours(hours, minutes, 0, 0);

        await TasksService.create(userId, {
          petId,
          title: item.task,
          taskType: item.taskType ?? 'OTHER',
          frequency: item.frequency ?? 'daily',
          dueDate: dueDate.toISOString(),
          notes: [item.notes, item.amount, item.duration].filter(Boolean).join(' | '),
        });
        tasksCreated++;
      } catch {
        // Skip individual task failures — don't abort the whole plan
      }
    }

    // Create reminders for upcoming vaccines
    for (const vax of carePlan.upcoming_vaccines ?? []) {
      if (vax.due_in_days <= 60) {
        try {
          const reminderDate = new Date();
          reminderDate.setDate(reminderDate.getDate() + vax.due_in_days);
          await RemindersService.create(userId, {
            petId,
            title: `${pet.name} — ${vax.vaccine} vaccine due`,
            reminderTime: reminderDate.toISOString(),
            frequency: 'none',
            notes: `Upcoming vaccine: ${vax.vaccine}`,
          });
        } catch {
          // Skip if reminder creation fails
        }
      }
    }

    return carePlan;
  },
};
