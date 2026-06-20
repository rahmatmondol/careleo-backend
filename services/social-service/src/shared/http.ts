/**
 * Shared HTTP helpers for social-service controllers.
 *
 * Service methods return either `{ data }` on success or `{ status, error }`
 * on failure. `fwd` copies any error status onto the Elysia `set` so the
 * response carries the right HTTP code, and returns the payload unchanged.
 */
export const fwd = (result: any, set: any) => {
  if (result?.status && result.status >= 400) set.status = result.status;
  return result;
};

/** beforeHandle guard for auth-protected routes. */
export const requireUser = ({ user, set }: any) => {
  if (!user) {
    set.status = 401;
    return { error: 'Unauthorized' };
  }
};
