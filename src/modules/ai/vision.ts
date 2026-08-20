import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { ResolvedModel } from './model-registry';

export type PetVisionResult = {
  petType: 'dog' | 'cat' | 'bird' | 'rabbit' | 'fish' | 'reptile' | 'hamster' | 'horse' | 'other_animal' | 'not_animal';
  breed: string;
  color: string;
  estimatedAge: string;
  size: 'small' | 'medium' | 'large' | 'unknown';
  confidence: number;
  rawAnalysis: string;
};

const VISION_PROMPT = `Analyze this image carefully.

Your task: Determine if this image contains an ANIMAL. ANY animal counts (dog, cat, bird, fish, rabbit, hamster, horse, reptile, exotic pet, etc).

Return a JSON object with EXACTLY these fields:
{
  "petType": one of "dog" | "cat" | "bird" | "rabbit" | "fish" | "reptile" | "hamster" | "horse" | "other_animal" | "not_animal",
  "breed": specific breed or species name (e.g. "Labrador Retriever", "Persian Cat", "Budgerigar", "Ball Python") or "Unknown",
  "color": primary coat/feather/scale color(s) as a short string (e.g. "golden", "black and white"),
  "estimatedAge": age estimate (e.g. "young (0-1 year)", "adult (1-5 years)", "senior (5+ years)") or "Unknown",
  "size": one of "small" | "medium" | "large" | "unknown",
  "confidence": a number from 0.0 to 1.0 representing how confident you are,
  "rawAnalysis": a brief 1-2 sentence description of what you see
}

Rules:
- Use "not_animal" ONLY if the image contains NO animal at all (e.g. food, landscape, object, human only, building)
- Use "other_animal" for any animal not in the specific list (e.g. cow, pig, deer, lion, exotic animals)
- If a human IS in the image but there is ALSO a visible animal, detect the animal
- Be generous — if there is any animal present, detect it

Return ONLY valid JSON. No markdown, no code blocks, no extra text.`;

/**
 * One image + one prompt → the model's raw text, on whichever provider is
 * configured. Both the breed identifier and the symptom observer go through
 * here; before this the provider fan-out was written out once per feature.
 */
async function generateVisionText(
  prompt: string,
  imageBase64: string,
  mimeType: string,
  resolvedModel?: ResolvedModel,
): Promise<string> {
  const provider = resolvedModel?.provider ?? 'google';
  // A moving alias for the same reason as the registry fallback — pinned
  // versions here have been retired out from under us twice.
  const modelName = resolvedModel?.modelName ?? 'gemini-flash-latest';
  const apiKey = resolvedModel?.apiKey ?? process.env.GOOGLE_GEMINI_API_KEY ?? '';

  if (!apiKey) throw new Error('No API key configured for vision model');

  // ── Anthropic (Claude) provider ──────────────────────────────────────
  if (provider === 'anthropic' || provider === 'anthropic_custom') {
    const client = new Anthropic({ apiKey, ...(resolvedModel?.baseUrl && { baseURL: resolvedModel.baseUrl }) });
    const response = await client.messages.create({
      model: modelName,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType as any, data: imageBase64 } },
          { type: 'text', text: prompt },
        ],
      }],
    });
    return (response.content[0] as any).text?.trim() ?? '';
  }

  // ── OpenAI / DeepSeek (OpenAI-compatible vision) ──────────────────
  if (provider === 'openai' || provider === 'deepseek' || provider === 'openai_custom') {
    const client = new OpenAI({ apiKey, baseURL: resolvedModel?.baseUrl ?? undefined });
    const response = await client.chat.completions.create({
      model: modelName,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          { type: 'text', text: prompt },
        ],
      }],
      max_tokens: 1024,
    });
    return response.choices[0]?.message?.content?.trim() ?? '';
  }

  // ── Google (Gemini) provider (default) ──────────────────────────────
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: imageBase64,
        mimeType: mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
      },
    },
  ]);
  return result.response.text().trim();
}

const stripFence = (text: string) =>
  text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

export async function analyzePetImage(
  imageBase64: string,
  mimeType: string,
  resolvedModel?: ResolvedModel,
): Promise<PetVisionResult> {
  const cleaned = stripFence(await generateVisionText(VISION_PROMPT, imageBase64, mimeType, resolvedModel));

  let parsed: PetVisionResult;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Vision model returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }

  if (!parsed.petType || parsed.confidence === undefined) {
    throw new Error('Vision response missing required fields');
  }

  return parsed;
}

// ─── Symptom observation ────────────────────────────────────────────────────

export type SymptomVisionResult = {
  /** Whether an animal is visible at all — a photo of a floor is not a symptom. */
  animalVisible: boolean;
  /** Plain descriptions of what is visible. Empty when nothing stands out. */
  observations: string[];
  /** Where on the body, if it can be told. */
  bodyArea: string;
  /** A category hint for the symptom picker — a suggestion, never forced. */
  suggestedCategory: 'skin' | 'digestive' | 'respiratory' | 'behavioral' | 'mobility' | null;
  /** Whether the photo is clear enough to say anything about. */
  imageQuality: 'good' | 'poor';
  confidence: number;
};

/**
 * What the model can actually see, described plainly.
 *
 * Deliberately NOT a diagnosis and not a triage: it reports visible features so
 * the owner can confirm them and the text assessment gets better input. The
 * prompt insists that "nothing abnormal is visible" is a correct, expected
 * answer — the screen this feeds used to invent a lesion for every photo,
 * which is the failure mode worth designing against.
 */
const SYMPTOM_VISION_PROMPT = `You are helping a pet owner describe what a photo shows before a veterinary triage question.

Look at the image and report ONLY what is visually present. Do NOT diagnose, do NOT name diseases, and do NOT guess at causes.

Return a JSON object with EXACTLY these fields:
{
  "animalVisible": true | false,
  "observations": array of short plain-language strings describing visible features relevant to health (e.g. "reddened skin on the left ear", "patch of missing fur near the tail", "clear discharge around the right eye"). Use [] if nothing health-relevant stands out.
  "bodyArea": short description of the body area shown (e.g. "left ear", "abdomen", "whole body") or "unknown",
  "suggestedCategory": one of "skin" | "digestive" | "respiratory" | "behavioral" | "mobility" | null,
  "imageQuality": "good" | "poor",
  "confidence": number from 0.0 to 1.0
}

Rules:
- An empty "observations" array is a CORRECT answer when the animal looks visually unremarkable. Never invent a finding to fill it.
- If no animal is visible, set animalVisible false, observations [], suggestedCategory null.
- If the image is blurry, dark or too close to tell, set imageQuality "poor" and keep observations conservative.
- "suggestedCategory" is only a hint about which body system the photo relates to; use null when unsure.
- Describe, do not interpret. "swelling on the paw" is fine; "infection" or "allergic reaction" is not.

Return ONLY valid JSON. No markdown, no code blocks, no extra text.`;

const CATEGORIES = ['skin', 'digestive', 'respiratory', 'behavioral', 'mobility'];

export async function observeSymptomsInImage(
  imageBase64: string,
  mimeType: string,
  resolvedModel?: ResolvedModel,
): Promise<SymptomVisionResult> {
  const cleaned = stripFence(
    await generateVisionText(SYMPTOM_VISION_PROMPT, imageBase64, mimeType, resolvedModel),
  );

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Vision model returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }

  const observations = Array.isArray(parsed?.observations)
    ? parsed.observations.map((o: unknown) => String(o)).filter(Boolean).slice(0, 6)
    : [];

  return {
    animalVisible: parsed?.animalVisible !== false,
    observations,
    bodyArea: String(parsed?.bodyArea ?? 'unknown'),
    suggestedCategory: CATEGORIES.includes(parsed?.suggestedCategory) ? parsed.suggestedCategory : null,
    imageQuality: parsed?.imageQuality === 'poor' ? 'poor' : 'good',
    confidence: typeof parsed?.confidence === 'number' ? parsed.confidence : 0,
  };
}
