import type { Context } from 'elysia';
import { AppError } from '../errors';
import { fail } from './response';

type ErrorContext = {
  code?: string;
  path?: string;
  method?: string;
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
