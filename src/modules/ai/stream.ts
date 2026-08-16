import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { AI_TOOL_DECLARATIONS, executeTool } from './tools';
import type { ResolvedModel } from './model-registry';

/**
 * Streaming chat turns.
 *
 * `sendMessage` only returns once the whole tool loop has finished, so a reply
 * that looks up a pet, checks stock and books something left the app staring at
 * a spinner for 10–20 seconds with no sign of progress. The app has always had
 * a WebSocket client for this — pointed at a `/ws/chat` route that was never
 * implemented — so nothing streamed and everything fell back to blocking REST.
 *
 * This runs the same tool loop, but yields as it goes: text as the model
 * produces it, and a `tool` event whenever an action starts, which is what lets
 * the UI say "checking your tasks…" instead of nothing.
 *
 * Kept apart from `service.ts` because each provider streams differently
 * enough that interleaving both shapes in one function would obscure both.
 */

export type ChatStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string }
  | {
      type: 'done';
      message: string;
      toolCalls: { tool: string; args: unknown; result: string }[];
      inputTokens: number;
      outputTokens: number;
    };

/**
 * An image sent with the message.
 *
 * Vision used to be a separate endpoint, so a user could analyse a photo *or*
 * have a conversation, never both — "does this rash look bad?" meant leaving
 * the chat, and the assistant never saw what the answer was about.
 */
export type ChatImage = { base64: string; mimeType: string };

export type StreamTurnParams = {
  resolved: ResolvedModel;
  systemPrompt: string;
  priorTurns: { role: 'user' | 'assistant'; content: string }[];
  userMessage: string;
  image?: ChatImage;
  userId: string;
  authToken?: string;
  /** Checked between iterations so a long tool chain cannot outrun the budget. */
  budgetExhausted: () => Promise<boolean>;
};

const MAX_ITERATIONS = 5;

export async function* streamChatTurn(
  params: StreamTurnParams,
): AsyncGenerator<ChatStreamEvent, void, unknown> {
  const { resolved, systemPrompt, priorTurns, userMessage, image, userId, authToken, budgetExhausted } = params;

  const toolCalls: { tool: string; args: unknown; result: string }[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let message = '';

  const runTool = async function* (name: string, args: Record<string, any>) {
    yield { type: 'tool' as const, name };
    const result = await executeTool(name, args, userId, authToken);
    toolCalls.push({ tool: name, args, result });
    return result;
  };

  // ── OpenAI-compatible (openai / deepseek / ollama / custom) ───────────────
  if (resolved.provider === 'openai' || resolved.provider === 'deepseek' || resolved.provider === 'openai_custom') {
    const client = new OpenAI({
      apiKey: resolved.apiKey,
      baseURL: resolved.baseUrl ?? (resolved.provider === 'deepseek' ? 'https://api.deepseek.com' : undefined),
    });

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...priorTurns,
      image
        ? {
            role: 'user',
            content: [
              { type: 'text', text: userMessage },
              { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.base64}` } },
            ],
          }
        : { role: 'user', content: userMessage },
    ];

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      if (iter > 0 && (await budgetExhausted())) break;

      const stream = await client.chat.completions.create({
        model: resolved.modelName,
        messages,
        tools: AI_TOOL_DECLARATIONS.map((t) => ({
          type: 'function' as const,
          function: { name: t.name, description: t.description, parameters: t.parameters },
        })),
        tool_choice: 'auto',
        stream: true,
        stream_options: { include_usage: true },
      });

      let text = '';
      // Tool calls arrive as fragments spread across chunks, keyed by index.
      const pending = new Map<number, { id: string; name: string; args: string }>();

      for await (const chunk of stream) {
        if (chunk.usage) {
          inputTokens += chunk.usage.prompt_tokens ?? 0;
          outputTokens += chunk.usage.completion_tokens ?? 0;
        }
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          text += delta.content;
          yield { type: 'delta', text: delta.content };
        }
        for (const tc of delta?.tool_calls ?? []) {
          const cur = pending.get(tc.index) ?? { id: '', name: '', args: '' };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          pending.set(tc.index, cur);
        }
      }

      if (pending.size === 0) {
        message += text;
        break;
      }

      const assembled = [...pending.values()];
      messages.push({
        role: 'assistant',
        content: text || null,
        tool_calls: assembled.map((c) => ({
          id: c.id,
          type: 'function' as const,
          function: { name: c.name, arguments: c.args || '{}' },
        })),
      });

      for (const call of assembled) {
        let args: Record<string, any> = {};
        try {
          args = JSON.parse(call.args || '{}');
        } catch {
          // A truncated argument fragment is the model's fault, not the user's;
          // run the tool with what parsed so it can report a clean failure.
        }
        const runner = runTool(call.name, args);
        const first = await runner.next();
        if (!first.done) yield first.value;
        const { value: result } = await runner.next();
        messages.push({ role: 'tool', tool_call_id: call.id, content: String(result ?? '') });
      }
    }

  // ── Anthropic ─────────────────────────────────────────────────────────────
  } else if (resolved.provider === 'anthropic' || resolved.provider === 'anthropic_custom') {
    const client = new Anthropic({
      apiKey: resolved.apiKey,
      ...(resolved.baseUrl && { baseURL: resolved.baseUrl }),
    });

    const messages: Anthropic.MessageParam[] = priorTurns.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    messages.push(
      image
        ? {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: image.mimeType as any, data: image.base64 },
              },
              { type: 'text', text: userMessage },
            ],
          }
        : { role: 'user', content: userMessage },
    );

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      if (iter > 0 && (await budgetExhausted())) break;

      const stream = client.messages.stream({
        model: resolved.modelName,
        max_tokens: 4096,
        system: systemPrompt,
        messages,
        tools: AI_TOOL_DECLARATIONS.map((t) => ({
          name: t.name,
          description: t.description ?? '',
          input_schema: (t.parameters ?? { type: 'object', properties: {} }) as Anthropic.Tool['input_schema'],
        })),
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'delta', text: event.delta.text };
        }
      }

      const final = await stream.finalMessage();
      inputTokens += final.usage?.input_tokens ?? 0;
      outputTokens += final.usage?.output_tokens ?? 0;

      const toolUses = final.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      if (toolUses.length === 0) {
        message += final.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n');
        break;
      }

      messages.push({ role: 'assistant', content: final.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        const runner = runTool(use.name, (use.input as Record<string, any>) ?? {});
        const first = await runner.next();
        if (!first.done) yield first.value;
        const { value: result } = await runner.next();
        results.push({ type: 'tool_result', tool_use_id: use.id, content: String(result ?? '') });
      }
      messages.push({ role: 'user', content: results });
    }

  // ── Gemini (default) ──────────────────────────────────────────────────────
  } else {
    const genAI = new GoogleGenerativeAI(resolved.apiKey);
    const model = genAI.getGenerativeModel({
      model: resolved.modelName,
      tools: [{ functionDeclarations: AI_TOOL_DECLARATIONS as any }],
    });
    const chat = model.startChat({
      history: priorTurns.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      systemInstruction: { role: 'user', parts: [{ text: systemPrompt }] },
    });

    let current: any = image
      ? [{ text: userMessage }, { inlineData: { data: image.base64, mimeType: image.mimeType } }]
      : userMessage;

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      if (iter > 0 && (await budgetExhausted())) break;

      const result = await chat.sendMessageStream(current);
      let text = '';
      for await (const chunk of result.stream) {
        const piece = chunk.text();
        if (piece) {
          text += piece;
          yield { type: 'delta', text: piece };
        }
      }

      const response = await result.response;
      inputTokens += response.usageMetadata?.promptTokenCount ?? 0;
      outputTokens += response.usageMetadata?.candidatesTokenCount ?? 0;

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      const calls = parts.filter((p: any) => p.functionCall);

      if (calls.length === 0) {
        message += text;
        break;
      }

      const responses: any[] = [];
      for (const part of calls) {
        const fc = (part as any).functionCall;
        if (!fc) continue;
        const runner = runTool(fc.name, (fc.args as Record<string, any>) ?? {});
        const first = await runner.next();
        if (!first.done) yield first.value;
        const { value: toolResult } = await runner.next();
        responses.push({ functionResponse: { name: fc.name, response: { result: toolResult } } });
      }
      current = responses;
    }
  }

  yield { type: 'done', message, toolCalls, inputTokens, outputTokens };
}
