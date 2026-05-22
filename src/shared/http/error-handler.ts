import type { Context } from 'elysia';
import { AppError } from '../errors';
import { fail } from './response';

export const handleApiError = (error: unknown, set?: Context['set']) => {
  if (error instanceof AppError) {
    if (set) set.status = error.status;
    return fail(error.code, error.message, error.details);
  }

  const e = error as { message?: string };
  if (set) set.status = 500;
  return fail('INTERNAL_SERVER_ERROR', e?.message || 'Something went wrong');
};
