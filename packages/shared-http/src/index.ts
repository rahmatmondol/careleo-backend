import type { ApiFailureResponse, ApiSuccessResponse } from '../../shared-types/src/index';

export const ok = <T>(data: T, meta?: Record<string, unknown>): ApiSuccessResponse<T> => ({
  success: true,
  data,
  ...(meta ? { meta } : {}),
});

export const fail = (code: string, message: string, details?: unknown): ApiFailureResponse => ({
  success: false,
  data: null,
  error: {
    code,
    message,
    ...(details !== undefined ? { details } : {}),
  },
});
