import { ForbiddenError, UnauthorizedError } from '@/shared/errors';
import type { DomainUser } from '@/shared/auth/domain-auth';
import { hasPermission } from './utils/common';

type GuardContext = { request: Request; user?: DomainUser | null };

/**
 * `beforeHandle` guard: any signed-in customer.
 *
 * shop-service's version returned `{ error: 'Unauthorized' }` after setting
 * `set.status`. That cannot work here — a returned object is a successful
 * payload as far as the `onAfterHandle` envelope in `app.ts` is concerned, so
 * the client would receive `{ success: true, data: { error: … } }`. Throwing
 * routes it through `handleApiError` and produces a proper failure envelope.
 */
export const requireAuth = ({ user }: GuardContext) => {
  if (!user) throw new UnauthorizedError('Authentication required');
};

/**
 * `beforeHandle` guard factory for the admin catalogue and order endpoints.
 *
 * Delegates to the shop's own `ROLE_PERMISSIONS` table in `utils/common.ts`
 * rather than the app-wide RBAC in `shared/auth/rbac.ts`. That is deliberate:
 * the two tables do not agree (the shop table is keyed on SUPER_ADMIN / OWNER /
 * ADMIN / MANAGER / STAFF, the app-wide one on super_admin / admin / support /
 * customer), so unifying them would change who can reach these routes. The
 * merge does not silently alter authorization — see the note in
 * `docs/microservices/merge-into-monolith.md` about reconciling the two.
 */
export const requirePermission =
  (permission: string) =>
  ({ user }: GuardContext) => {
    if (!user) throw new UnauthorizedError('Authentication required');
    if (!hasPermission(user.role, permission)) {
      throw new ForbiddenError(`Missing permission: ${permission}`);
    }
  };
