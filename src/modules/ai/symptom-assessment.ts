import { GoogleGenerativeAI } from '@google/generative-ai';
import { getModelForPurpose, recordTokenUsage } from './model-registry';
import { PetProfileModel } from '@/modules/pet-profile/model';

export type SymptomAssessment = {
  urgency: 'low' | 'medium' | 'high' | 'emergency';
  concern: string;
  shouldSeeVet: boolean;
  advice: string;
  disclaimer: string;
};

const DISCLAIMER = 'This is AI guidance, not a veterinary diagnosis. For anything serious or worsening, consult a licensed vet.';

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
    if (resolved.provider !== 'google' || !resolved.apiKey) return fallback;

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

    const genAI = new GoogleGenerativeAI(resolved.apiKey);
    const model = genAI.getGenerativeModel({ model: resolved.modelName });
    const result = await model.generateContent(prompt);
    const usage = result.response.usageMetadata;
    await recordTokenUsage({
      userId, petId, model: resolved, feature: 'symptom_assessment',
      inputTokens: usage?.promptTokenCount ?? 200, outputTokens: usage?.candidatesTokenCount ?? 120,
    });

    const parsed = parseJson(result.response.text());
    if (!parsed || typeof parsed !== 'object') return fallback;
    const urgency = ['low', 'medium', 'high', 'emergency'].includes(parsed.urgency) ? parsed.urgency : 'medium';
    return {
      urgency,
      concern: String(parsed.concern ?? fallback.concern),
      shouldSeeVet: parsed.shouldSeeVet ?? urgency !== 'low',
      advice: String(parsed.advice ?? fallback.advice),
      disclaimer: DISCLAIMER,
    };
  } catch (e: any) {
    console.warn('[assessSymptoms] failed, using fallback:', e?.message ?? e);
    return fallback;
  }
}
