/**
 * Shared HTTP helpers for freelancer-service controllers.
 *
 * Service methods return either `{ data }` on success or `{ status, error }`
 * on failure. `fwd` copies any error status onto the Elysia `set`.
 */
export const fwd = (result: any, set: any) => {
  if (result?.status && result.status >= 400) set.status = result.status;
  return result;
};

/** beforeHandle guard for any logged-in user (customer or freelancer). */
export const requireUser = ({ user, set }: any) => {
  if (!user) {
    set.status = 401;
    return { error: 'Unauthorized' };
  }
};

/** beforeHandle guard for internal service-to-service calls. */
export const requireInternal = ({ headers, set }: any) => {
  const secret = process.env.INTERNAL_SERVICE_SECRET;
  if (!secret || headers['x-internal-secret'] !== secret) {
    set.status = 401;
    return { error: 'Unauthorized (internal)' };
  }
};
