import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { ResolvedModel } from './model-registry';

/**
 * One-shot text generation across every configured provider.
 *
 * This lives in its own module rather than in `service.ts` because the callers
 * that need it most — `pet-profile/service.ts` (fact extraction) and
 * `symptom-assessment.ts` — are imported *by* `service.ts`, so importing back
 * from it would close a cycle.
 *
 * It exists at all because several features used to hand-roll a Gemini client
 * and bail out with `if (resolved.provider !== 'google') return fallback`. An
 * admin switching the model to Anthropic in the Plan Builder silently turned
 * off pet memory, proactive check-ins and symptom triage, with nothing logged
 * and nothing to see. Anything that needs a completion should come through
 * here so that can never drift again.
 */
export async function generateText(
  resolved: ResolvedModel,
  prompt: string,
  maxTokens = 2048,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  if (resolved.provider === 'openai' || resolved.provider === 'deepseek' || resolved.provider === 'openai_custom') {
    const client = new OpenAI({
      apiKey: resolved.apiKey,
      baseURL: resolved.baseUrl ?? (resolved.provider === 'deepseek' ? 'https://api.deepseek.com' : undefined),
    });
    const res = await client.chat.completions.create({
      model: resolved.modelName,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
    });
    return {
      text: res.choices[0]?.message?.content ?? '',
      inputTokens: res.usage?.prompt_tokens ?? 0,
      outputTokens: res.usage?.completion_tokens ?? 0,
    };
  }

  if (resolved.provider === 'anthropic' || resolved.provider === 'anthropic_custom') {
    const client = new Anthropic({
      apiKey: resolved.apiKey,
      ...(resolved.baseUrl && { baseURL: resolved.baseUrl }),
    });
    const res = await client.messages.create({
      model: resolved.modelName,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    return {
      text: res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n'),
      inputTokens: res.usage?.input_tokens ?? 0,
      outputTokens: res.usage?.output_tokens ?? 0,
    };
  }

  // Google Gemini (default)
  const genAI = new GoogleGenerativeAI(resolved.apiKey);
  const model = genAI.getGenerativeModel({ model: resolved.modelName });
  const result = await model.generateContent(prompt);
  const usage = result.response.usageMetadata;
  return {
    text: result.response.text() ?? '',
    inputTokens: usage?.promptTokenCount ?? 0,
    outputTokens: usage?.candidatesTokenCount ?? 0,
  };
}

/** Strip markdown fences a model may wrap JSON in, then parse. */
export function parseJsonResponse(text: string) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(cleaned);
}
