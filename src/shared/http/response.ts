export type ApiMeta = Record<string, unknown>;

export type ApiSuccess<T> = {
  success: true;
  data: T;
  error: null;
  meta?: ApiMeta;
};

export type ApiFailure = {
  success: false;
  data: null;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: ApiMeta;
};

/**
 * Build a standard success response envelope for all API handlers.
 */
export const ok = <T>(data: T, meta?: ApiMeta): ApiSuccess<T> => ({
  success: true,
  data,
  error: null,
  ...(meta ? { meta } : {}),
});

/**
 * Build a standard error response envelope for all API handlers.
 */
export const fail = (
  code: string,
  message: string,
  details?: unknown,
  meta?: ApiMeta
): ApiFailure => ({
  success: false,
  data: null,
  error: { code, message, ...(details !== undefined ? { details } : {}) },
  ...(meta ? { meta } : {}),
});
