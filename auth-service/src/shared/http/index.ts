import type { ApiFailureResponse, ApiSuccessResponse } from '../types';

/** Build consistent success response payload. */
export const ok = <T>(data: T, meta?: Record<string, unknown>): ApiSuccessResponse<T> => ({
  success: true,
  data,
  ...(meta ? { meta } : {}),
});

/** Build consistent failure response payload. */
export const fail = (code: string, message: string, details?: unknown): ApiFailureResponse => ({
  success: false,
  data: null,
  error: {
    code,
    message,
    ...(details !== undefined ? { details } : {}),
  },
});
