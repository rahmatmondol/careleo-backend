import { errorForStatus } from '../errors';

/**
 * Bridge between the merged domain modules and the app-wide response envelope.
 *
 * The shop, social, video, media and freelancer modules were standalone
 * services before the merge. Their service layer reports outcomes as values
 * rather than exceptions:
 *
 *   success →  { data: <payload> }
 *   failure →  { status: 404, error: 'Post not found' }
 *
 * The rest of the backend instead returns a bare payload and throws typed
 * errors from `shared/errors`, which `app.ts` turns into the standard
 * `{ success, data, error }` envelope.
 *
 * `unwrap` translates one convention into the other at the controller boundary:
 * it throws for failures and returns the bare payload for successes, so a
 * merged endpoint is indistinguishable from a native one on the wire. That is
 * the whole reason this file exists — without it every merged response would
 * come back double-nested as `{ success: true, data: { data: … } }`.
 *
 * Keeping the translation here (rather than rewriting ~100 service methods to
 * throw) means the service layer stays a pure, testable function of its inputs.
 */

export type ServiceSuccess<T> = { data: T; status?: number };
export type ServiceFailure = { status: number; error: string; details?: unknown };
export type ServiceResult<T> = ServiceSuccess<T> | ServiceFailure;

/**
 * The payload carried by the success arm(s) of a service result.
 *
 * Distributive on purpose. Several service methods return a union of success
 * shapes (an empty-feed branch and a populated-feed branch, say); inferring a
 * single `T` across that union collapses `Post[]` into `never[]`, so the
 * payload type is extracted per-arm and re-unioned instead.
 */
export type UnwrappedData<R> = R extends { data: infer D } ? D : never;

const isFailure = (result: unknown): result is ServiceFailure =>
  typeof result === 'object' &&
  result !== null &&
  'status' in result &&
  typeof (result as ServiceFailure).status === 'number' &&
  (result as ServiceFailure).status >= 400;

/**
 * Unwrap a service result for return from an Elysia handler.
 *
 * @param result  what the service method returned
 * @param set     Elysia's `set`, used to carry a success status such as 201
 * @throws AppError when the service reported a failure status
 */
export const unwrap = <R extends ServiceResult<unknown>>(
  result: R,
  set?: { status?: number | string },
): UnwrappedData<R> => {
  if (isFailure(result)) {
    throw errorForStatus(result.status, result.error, result.details);
  }

  // A success status other than 200 (e.g. 201 Created) is carried through.
  if (set && typeof (result as ServiceSuccess<unknown>).status === 'number') {
    set.status = (result as ServiceSuccess<unknown>).status;
  }

  return (result as ServiceSuccess<unknown>).data as UnwrappedData<R>;
};

/**
 * Legacy alias. The merged controllers were written against a helper called
 * `fwd(result, set)`; keeping the name means the ported code did not have to be
 * touched line by line, while the behaviour is now the unwrapping one above.
 */
export const fwd = unwrap;
