import { getModelForPurpose, recordTokenUsage } from './model-registry';
import { generateText } from './generate';
import { PetProfileModel } from '@/modules/pet-profile/model';
import { db } from '@/shared/db';
import { symptomReports } from '@/shared/db/schema';

export type SymptomAssessment = {
  urgency: 'low' | 'medium' | 'high' | 'emergency';
  concern: string;
  shouldSeeVet: boolean;
  advice: string;
  disclaimer: string;
};

const DISCLAIMER = 'This is AI guidance, not a veterinary diagnosis. For anything serious or worsening, consult a licensed vet.';

/**
 * How long to wait before asking how the pet is doing.
 *
 * The triage itself was always the easy half. The half that changes outcomes is
 * coming back two days later and asking whether the limp got better — which is
 * only possible because the assessment is now written down.
 */
const FOLLOW_UP_HOURS: Record<SymptomAssessment['urgency'], number> = {
  emergency: 6,
  high: 12,
  medium: 48,
  low: 96,
};

/** Best-effort persistence; triage must still work if the write fails. */
const recordAssessment = async (
  userId: string,
  petId: string | undefined,
  symptomText: string,
  assessment: SymptomAssessment,
) => {
  try {
    await db.insert(symptomReports).values({
      userId,
      petId: petId ?? null,
      symptoms: symptomText,
      urgency: assessment.urgency,
      concern: assessment.concern,
      advice: assessment.advice,
      shouldSeeVet: assessment.shouldSeeVet,
      followUpAt: new Date(Date.now() + FOLLOW_UP_HOURS[assessment.urgency] * 60 * 60 * 1000),
    });
  } catch (e: any) {
    console.warn('[assessSymptoms] could not record report:', e?.message ?? e);
  }
};

const parseJson = (text: string): any => {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch { return null; } }
    return null;
  }
};

/**
 * Dedicated AI symptom assessment. Reads the pet's profile/facts for context,
 * asks the model for a structured triage (urgency + whether to see a vet), and
 * returns advice — explicitly NOT a diagnosis. Safe fallback on any failure.
 */
export async function assessSymptoms(
  userId: string,
  petId: string | undefined,
  symptoms: string[],
): Promise<SymptomAssessment> {
  const symptomText = (symptoms ?? []).filter(Boolean).join(', ') || 'unspecified symptoms';
  const fallback: SymptomAssessment = {
    urgency: 'medium',
    concern: 'Unable to assess automatically',
    shouldSeeVet: true,
    advice: `I could not fully assess "${symptomText}". To be safe, consider checking with a vet.`,
    disclaimer: DISCLAIMER,
  };

  try {
    const resolved = await getModelForPurpose('general_chat');
    // Was `provider !== 'google'` — on any other provider every pet owner got
    // the "unable to assess" fallback with no indication triage was off.
    if (!resolved.apiKey) {
      await recordAssessment(userId, petId, symptomText, fallback);
      return fallback;
    }

    let context = '';
    if (petId) {
      try {
        const profile = await PetProfileModel.getProfile(petId);
        const facts = await PetProfileModel.listFacts(petId, { activeOnly: true, limit: 10 });
        const bits: string[] = [];
        if (profile?.healthConditions?.length) bits.push(`Conditions: ${profile.healthConditions.join(', ')}`);
        if (profile?.allergies?.length) bits.push(`Allergies: ${profile.allergies.join(', ')}`);
        if (profile?.medications?.length) bits.push(`Medications: ${profile.medications.join(', ')}`);
        if (facts.length) bits.push('Known: ' + facts.map((f) => f.fact).join('; '));
        if (bits.length) context = `\nPet context:\n${bits.join('\n')}`;
      } catch { /* context is best-effort */ }
    }

    const prompt = `You are a veterinary triage assistant. Assess these pet symptoms and respond with STRICT JSON only.
Symptoms: ${symptomText}${context}

Return:
{
  "urgency": "low" | "medium" | "high" | "emergency",
  "concern": "short possible concern (not a definitive diagnosis)",
  "shouldSeeVet": true | false,
  "advice": "1-2 sentences of practical guidance in the owner's language"
}
Be cautious: if symptoms could indicate something serious, lean toward higher urgency and shouldSeeVet=true. JSON only.`;

    const { text, inputTokens, outputTokens } = await generateText(resolved, prompt, 1024);
    await recordTokenUsage({
      userId, petId, model: resolved, feature: 'symptom_assessment',
      inputTokens, outputTokens,
    });

    const parsed = parseJson(text);
    if (!parsed || typeof parsed !== 'object') {
      await recordAssessment(userId, petId, symptomText, fallback);
      return fallback;
    }
    const urgency = ['low', 'medium', 'high', 'emergency'].includes(parsed.urgency) ? parsed.urgency : 'medium';
    const assessment: SymptomAssessment = {
      urgency,
      concern: String(parsed.concern ?? fallback.concern),
      shouldSeeVet: parsed.shouldSeeVet ?? urgency !== 'low',
      advice: String(parsed.advice ?? fallback.advice),
      disclaimer: DISCLAIMER,
    };

    await recordAssessment(userId, petId, symptomText, assessment);
    return assessment;
  } catch (e: any) {
    console.warn('[assessSymptoms] failed, using fallback:', e?.message ?? e);
    await recordAssessment(userId, petId, symptomText, fallback);
    return fallback;
  }
}
