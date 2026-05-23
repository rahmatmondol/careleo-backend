export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

export type ApiSuccessResponse<T = unknown> = {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
};

export type ApiFailureResponse = {
  success: false;
  data: null;
  error: ApiError;
};

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiFailureResponse;

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type JwtClaims = {
  id: string;
  email: string;
  role: string;
};

export type DomainEvent<TPayload = unknown> = {
  eventId: string;
  eventType: string;
  occurredAt: string;
  source: string;
  payload: TPayload;
};
