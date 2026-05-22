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

export const ok = <T>(data: T, meta?: ApiMeta): ApiSuccess<T> => ({
  success: true,
  data,
  error: null,
  ...(meta ? { meta } : {}),
});

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
