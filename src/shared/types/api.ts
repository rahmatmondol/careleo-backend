export type ApiSuccess<T> = {
  success: true;
  data: T;
  error: null;
  meta?: Record<string, unknown>;
};

export type ApiError = {
  success: false;
  data: null;
  error: { code: string; message: string; details?: unknown };
  meta?: Record<string, unknown>;
};
