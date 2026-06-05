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

export async function analyzePetImage(
  imageBase64: string,
  mimeType: string,
  resolvedModel?: ResolvedModel,
): Promise<PetVisionResult> {
  const provider = resolvedModel?.provider ?? 'google';
  const modelName = resolvedModel?.modelName ?? 'gemini-1.5-flash';
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
          { type: 'text', text: VISION_PROMPT },
        ],
      }],
    });
    const text = (response.content[0] as any).text?.trim() ?? '';
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    try {
      const parsed: PetVisionResult = JSON.parse(cleaned);
      if (!parsed.petType || parsed.confidence === undefined) throw new Error('missing fields');
      return parsed;
    } catch {
      throw new Error(`Claude returned invalid JSON: ${cleaned.slice(0, 200)}`);
    }
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
          { type: 'text', text: VISION_PROMPT },
        ],
      }],
      max_tokens: 1024,
    });
    const text = response.choices[0]?.message?.content?.trim() ?? '';
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    try {
      const parsed: PetVisionResult = JSON.parse(cleaned);
      if (!parsed.petType || parsed.confidence === undefined) throw new Error('missing fields');
      return parsed;
    } catch {
      throw new Error(`${provider} returned invalid JSON: ${cleaned.slice(0, 200)}`);
    }
  }

  // ── Google (Gemini) provider (default) ──────────────────────────────
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const result = await model.generateContent([
    VISION_PROMPT,
    {
      inlineData: {
        data: imageBase64,
        mimeType: mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
      },
    },
  ]);

  const text = result.response.text().trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  let parsed: PetVisionResult;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Gemini returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }

  if (!parsed.petType || parsed.confidence === undefined) {
    throw new Error('Gemini response missing required fields');
  }

  return parsed;
}
