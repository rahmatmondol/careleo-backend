export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 400,
    public details?: unknown
  ) {
    super(message);
  }
}

/**
 * Use when request payload/query/path validation fails.
 */
export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super('VALIDATION_ERROR', message, 422, details);
  }
}

/**
 * Use when an expected resource cannot be found.
 */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: unknown) {
    super('NOT_FOUND', message, 404, details);
  }
}

/**
 * Use when authentication/authorization checks fail.
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details?: unknown) {
    super('UNAUTHORIZED', message, 401, details);
  }
}

/**
 * Use when the caller is authenticated but not allowed to perform the action.
 * Distinct from UnauthorizedError (401): re-authenticating will not help.
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details?: unknown) {
    super('FORBIDDEN', message, 403, details);
  }
}

/**
 * Use when the request conflicts with current state — a duplicate follow, an
 * already-cancelled booking, a slug that is taken.
 */
export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: unknown) {
    super('CONFLICT', message, 409, details);
  }
}

/**
 * Use for a bad request that is not a schema validation failure — a malformed
 * id, an unsupported status transition, a missing required combination.
 */
export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: unknown) {
    super('BAD_REQUEST', message, 400, details);
  }
}

/**
 * Build the right AppError subclass from an HTTP status code.
 *
 * Used by the adapter that bridges the merged shop/social/video/media/freelancer
 * modules — their service layer reports failures as `{ status, error }` rather
 * than by throwing — onto the central error envelope. See
 * `shared/http/service-result.ts`.
 */
export const errorForStatus = (status: number, message: string, details?: unknown): AppError => {
  switch (status) {
    case 400:
      return new BadRequestError(message, details);
    case 401:
      return new UnauthorizedError(message, details);
    case 403:
      return new ForbiddenError(message, details);
    case 404:
      return new NotFoundError(message, details);
    case 409:
      return new ConflictError(message, details);
    case 422:
      return new ValidationError(message, details);
    default:
      return new AppError(status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_FAILED', message, status, details);
  }
};
