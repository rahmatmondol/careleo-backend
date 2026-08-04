import { ForbiddenError, UnauthorizedError } from '@/shared/errors';
import type { DomainUser } from '@/shared/auth/domain-auth';
import { hasPermission } from './constants/permissions';

type GuardContext = { request: Request; user?: DomainUser | null };

/**
 * ⚠️ Security note — this is a behaviour change, and an intentional one.
 *
 * media-service did not verify JWT signatures. Its `getUser()` base64-decoded
 * the token payload and trusted whatever `role` it found:
 *
 *     const payload = JSON.parse(Buffer.from(padded, 'base64').toString());
 *     return { id: payload.sub ?? payload.id, role: payload.role };
 *
 * Any client could mint `{"sub":"x","role":"SUPER_ADMIN"}`, base64 it, and get
 * full media.manage access — upload, overwrite and delete. The service was
 * reachable through the public gateway at `/api/v1/media/*`.
 *
 * Merged in, media uses the same verified `domainAuth` derive as every other
 * module, so a token must carry a valid `JWT_ACCESS_SECRET` signature. Forged
 * tokens now get 401. Legitimate clients are unaffected: they already send real
 * tokens issued by `/auth/login`.
 *
 * The old `x-internal-key` bypass (`INTERNAL_SERVICE_KEY`, default the
 * hard-coded string `'pawly-internal'`) is gone with it — shop-service was its
 * only user, and it calls these handlers in-process now.
 */

/** `beforeHandle` guard: caller must hold the `media.read` permission. */
export const requireMediaRead = ({ user }: GuardContext) => {
  if (!user) throw new UnauthorizedError('Authentication required');
  if (!hasPermission(user.role, 'media.read')) {
    throw new ForbiddenError('Missing permission: media.read');
  }
};

/** `beforeHandle` guard: caller must hold the `media.manage` permission. */
export const requireMediaManage = ({ user }: GuardContext) => {
  if (!user) throw new UnauthorizedError('Authentication required');
  if (!hasPermission(user.role, 'media.manage')) {
    throw new ForbiddenError('Missing permission: media.manage');
  }
};
