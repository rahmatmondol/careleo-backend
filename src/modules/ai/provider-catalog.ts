/**
 * Provider catalog — the single source of truth for which AI providers an
 * admin may add from the panel, how they route, and what each one requires.
 *
 * The chat/vision/care-plan services route on the *stored* provider string
 * (`google` | `openai` | `deepseek` | `openai_custom` | `anthropic` |
 * `anthropic_custom`). This catalog adds admin-facing "kinds" on top of those
 * — including subscription-via-proxy options — and normalizes each one back to
 * a routing provider the services already understand, so no routing code has
 * to change.
 *
 * NOTE — no "chat subscription" option, by design:
 * A ChatGPT Plus / Claude Pro-Max subscription is not an API product. Neither
 * provider exposes an endpoint you can call with the account credentials, and
 * scraping a session token to fake one violates their ToS and gets accounts
 * banned. Models are added with an API key. If you want to front several
 * providers behind one endpoint, run a gateway (LiteLLM, Ollama, etc.) and add
 * it via the `openai_custom` / `anthropic_custom` options with a base URL.
 */

import { ValidationError } from '@/shared/errors';

export type RoutingProvider =
  | 'google'
  | 'openai'
  | 'deepseek'
  | 'openai_custom'
  | 'anthropic'
  | 'anthropic_custom';

export interface ProviderOption {
  /** Value the admin panel sends back and we store in `ai_model_configs.provider`. */
  id: string;
  /** Human label for the dropdown. */
  label: string;
  /** The routing provider the chat/vision services actually branch on. */
  routesAs: RoutingProvider;
  /** Whether a base URL is mandatory (custom / self-hosted / proxy). */
  requiresBaseUrl: boolean;
  /** Example model name to hint the admin. */
  exampleModel: string;
  /** Short helper text for the form. */
  hint: string;
}

export const PROVIDER_CATALOG: ProviderOption[] = [
  {
    id: 'google',
    label: 'Google Gemini',
    routesAs: 'google',
    requiresBaseUrl: false,
    exampleModel: 'gemini-2.0-flash',
    hint: 'Official Gemini API key from Google AI Studio.',
  },
  {
    id: 'openai',
    label: 'OpenAI (GPT)',
    routesAs: 'openai',
    requiresBaseUrl: false,
    exampleModel: 'gpt-4o',
    hint: 'Official OpenAI API key (platform.openai.com). Pay-per-token, not a ChatGPT Plus subscription.',
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    routesAs: 'anthropic',
    requiresBaseUrl: false,
    exampleModel: 'claude-sonnet-5',
    hint: 'Official Anthropic API key (console.anthropic.com). Pay-per-token, not a Claude Pro/Max subscription.',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    routesAs: 'deepseek',
    requiresBaseUrl: false,
    exampleModel: 'deepseek-chat',
    hint: 'DeepSeek API key. Defaults to https://api.deepseek.com if no base URL is set.',
  },
  {
    id: 'openai_custom',
    label: 'OpenAI-compatible endpoint (self-hosted / Ollama / LiteLLM)',
    routesAs: 'openai_custom',
    requiresBaseUrl: true,
    exampleModel: 'llama3.1',
    hint: 'Any OpenAI-compatible server. Requires a base URL (e.g. http://localhost:11434/v1).',
  },
  {
    id: 'anthropic_custom',
    label: 'Anthropic-compatible endpoint (self-hosted proxy)',
    routesAs: 'anthropic_custom',
    requiresBaseUrl: true,
    exampleModel: 'claude-sonnet-5',
    hint: 'An Anthropic-compatible proxy you control. Requires a base URL.',
  },
];

const CATALOG_BY_ID = new Map(PROVIDER_CATALOG.map((p) => [p.id, p]));

/** Routing providers the services accept directly (for back-compat validation). */
const RAW_ROUTING_PROVIDERS = new Set<string>([
  'google',
  'openai',
  'deepseek',
  'openai_custom',
  'anthropic',
  'anthropic_custom',
]);

export interface NormalizedModelConfig {
  /** Provider string to persist — always a RoutingProvider the services understand. */
  provider: RoutingProvider;
  baseUrl: string | null;
}

/**
 * Extends the shared ValidationError so `handleApiError` returns a 422 with the
 * message intact (a plain Error would surface as an opaque 500).
 */
export class ProviderValidationError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderValidationError';
  }
}

/**
 * Validate an admin-submitted provider + baseUrl and normalize the provider to
 * a routing value the chat/vision/care-plan services already branch on.
 *
 * Accepts both catalog ids (e.g. `anthropic_custom`) and raw routing
 * providers (e.g. `anthropic_custom`) so existing stored rows keep working.
 */
export function validateAndNormalizeProvider(input: {
  provider: string;
  baseUrl?: string | null;
}): NormalizedModelConfig {
  const provider = (input.provider ?? '').trim();
  const baseUrl = input.baseUrl?.trim() || null;

  if (!provider) {
    throw new ProviderValidationError('Provider is required.');
  }

  const option = CATALOG_BY_ID.get(provider);

  // Unknown id that is also not a raw routing provider → reject with guidance.
  if (!option && !RAW_ROUTING_PROVIDERS.has(provider)) {
    const valid = [...CATALOG_BY_ID.keys(), ...RAW_ROUTING_PROVIDERS].join(', ');
    throw new ProviderValidationError(
      `Unknown provider "${provider}". Valid options: ${valid}.`,
    );
  }

  const requiresBaseUrl = option
    ? option.requiresBaseUrl
    : provider.endsWith('_custom');

  if (requiresBaseUrl && !baseUrl) {
    throw new ProviderValidationError(
      `Provider "${provider}" requires a base URL (the endpoint you control).`,
    );
  }

  if (baseUrl && !/^https?:\/\//i.test(baseUrl)) {
    throw new ProviderValidationError(
      `Base URL must start with http:// or https:// (got "${baseUrl}").`,
    );
  }

  const routesAs: RoutingProvider = option
    ? option.routesAs
    : (provider as RoutingProvider);

  return { provider: routesAs, baseUrl };
}

/** Catalog shaped for the admin panel dropdown. */
export function getProviderCatalog() {
  return PROVIDER_CATALOG.map((p) => ({
    id: p.id,
    label: p.label,
    requiresBaseUrl: p.requiresBaseUrl,
    exampleModel: p.exampleModel,
    hint: p.hint,
  }));
}
