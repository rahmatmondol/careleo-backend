import type { Context } from 'elysia';
import { AppError } from '../errors';
import { fail } from './response';

type ErrorContext = {
  code?: string;
  path?: string;
  method?: string;
};

type ValidationField = { field: string; message: string };

/**
 * Which fields failed, in a shape a client can act on.
 *
 * Elysia exposes the individual errors on `.all`, but the message is also a
 * JSON dump of the first one, so parse that as a fallback for a validator that
 * did not populate `all`. Anything unrecognisable yields an empty list and the
 * caller falls back to a generic summary.
 */
const validationFields = (error: unknown): ValidationField[] => {
  const toField = (item: any): ValidationField | null => {
    const field = String(item?.path ?? item?.property ?? '').replace(/^\//, '');
    const message = String(item?.summary ?? item?.message ?? '').trim();
    if (!message) return null;
    return { field: field || '(body)', message };
  };

  const all = (error as { all?: unknown })?.all;
  if (Array.isArray(all)) {
    const fields = all.map(toField).filter((f): f is ValidationField => f !== null);
    if (fields.length) return fields.slice(0, 10);
  }

  try {
    const parsed = JSON.parse(String((error as { message?: string })?.message ?? ''));
    const single = toField(parsed);
    return single ? [single] : [];
  } catch {
    return [];
  }
};

/**
 * Convert thrown exceptions into the centralized API error envelope.
 */
export const handleApiError = (error: unknown, set?: Context['set'], ctx?: ErrorContext) => {
  if (error instanceof AppError) {
    if (set) set.status = error.status;
    return fail(error.code, error.message, error.details);
  }

  const e = error as { message?: string; stack?: string };

  /**
   * A request that fails schema validation is the client's mistake, not the
   * server's — but it fell through to the 500 branch below, so every endpoint
   * with a `body` or `query` schema answered a malformed request with
   * INTERNAL_SERVER_ERROR and Elysia's raw JSON dump as the message. Callers
   * could not tell "you sent bad data" from "the server broke", and every such
   * request showed up in monitoring as a server fault.
   */
  if (ctx?.code === 'VALIDATION') {
    // 422, not 400: the app's own `ValidationError` is 422 with this same
    // code, and a schema check failing is the same class of problem as a
    // hand-written one. One code must not mean two statuses.
    if (set) set.status = 422;

    const fields = validationFields(error);
    const summary = fields.length
      ? fields.map((f) => f.message).join('; ')
      : 'Request did not match the expected shape';

    return fail('VALIDATION_ERROR', summary, {
      ...(fields.length ? { fields } : {}),
      on: (error as { type?: string })?.type,
      path: ctx?.path,
      method: ctx?.method,
    });
  }

  // Preserve framework 404 semantics instead of masking as 500.
  if (ctx?.code === 'NOT_FOUND' || e?.message === 'NOT_FOUND') {
    if (set) set.status = 404;
    return fail('NOT_FOUND', 'Route not found', {
      path: ctx?.path,
      method: ctx?.method,
    });
  }

  if (set) set.status = 500;

  // In development, include lightweight debug details for faster troubleshooting.
  if (process.env.NODE_ENV !== 'production') {
    return fail('INTERNAL_SERVER_ERROR', e?.message || 'Something went wrong', {
      path: ctx?.path,
      method: ctx?.method,
    });
  }

  return fail('INTERNAL_SERVER_ERROR', 'Something went wrong');
};
