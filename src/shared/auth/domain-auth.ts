import { jwt } from '@elysiajs/jwt';
import { Elysia } from 'elysia';
import { ForbiddenError, UnauthorizedError } from '../errors';

/**
 * Bearer-token auth for the merged domain modules (shop, social, video, media,
 * freelancer).
 *
 * Those modules were standalone services, each with its own copy of this
 * middleware verifying against its own `JWT_SECRET` (which docker-compose set
 * to `JWT_ACCESS_SECRET` so the tokens stayed interchangeable). There is one
 * copy now, and it verifies against `JWT_ACCESS_SECRET` directly — `JWT_SECRET`
 * is no longer read anywhere.
 *
 * Why this exists alongside `requireAuth` in `guards.ts`: the native modules
 * call `requireAuth(headers, jwt)` inside each handler and treat a missing
 * token as fatal. The merged modules were built around a *derived, optional*
 * `user` — many of their routes are public reads that behave differently when
 * signed in (a feed marks which posts you liked). Preserving that shape keeps
 * the ported controllers working as written; `requireUser` below is what makes
 * a route mandatory.
 */

const SECRET = process.env.JWT_ACCESS_SECRET || 'dev_jwt_secret_change_me';

export type DomainUser = {
  id: string;
  role: string;
  email?: string;
};

/**
 * Registered under its own plugin name so it cannot collide with the global
 * `jwt` instance in `app.ts`, which the native modules resolve by name.
 */
export const domainAuth = new Elysia({ name: 'domain-auth' })
  .use(jwt({ name: 'domainJwt', secret: SECRET }))
  // `as: 'global'` so the derived `user` propagates into sibling route plugins.
  // With the default (local) scope, controllers registered after this one see
  // `user` as undefined and every guard below would reject.
  .derive({ as: 'global' }, async ({ domainJwt, headers }) => {
    const authorization = headers.authorization;
    let user: DomainUser | null = null;

    if (authorization?.startsWith('Bearer ')) {
      try {
        const payload = await domainJwt.verify(authorization.slice(7));

        /**
         * Two token shapes are in circulation, and both must work:
         *
         *   - `modules/auth` (customers) signs `{ id, email, role }`
         *   - `modules/freelancer/auth` signs `{ sub, email, role }`
         *
         * Reading only `sub` would leave every customer anonymous on these
         * routes — cart, orders, addresses, subscriptions and checkout would
         * all 401. shop-service handled this with the same `sub ?? id`
         * fallback; social-service and video-service did not, which is why
         * their authenticated routes never worked with a customer token.
         */
        const subject = payload
          ? ((payload as Record<string, unknown>).sub ?? (payload as Record<string, unknown>).id)
          : undefined;

        if (typeof subject === 'string' && subject.length > 0) {
          user = {
            id: subject,
            role: String((payload as Record<string, unknown>).role ?? 'customer'),
            email:
              typeof (payload as Record<string, unknown>).email === 'string'
                ? ((payload as Record<string, unknown>).email as string)
                : undefined,
          };
        }
      } catch {
        // An invalid or expired token is treated as anonymous rather than as an
        // error, so public routes keep working for a client holding a stale
        // token. Routes that need identity say so with `requireUser`.
      }
    }

    return { user };
  });

/**
 * Shape a `beforeHandle` guard sees.
 *
 * Two deliberate details:
 *
 * - `user` is optional. The derive above adds it at runtime, but Elysia's
 *   static context for a *sibling* plugin does not know that, so a guard
 *   demanding `user` would not be assignable to `beforeHandle`.
 * - `request` is required even though no guard reads it. With `user` optional
 *   and nothing else, this would be a "weak type" — TypeScript rejects
 *   assigning any value that shares none of its properties, which is exactly
 *   what Elysia's context is. Anchoring on one property the context definitely
 *   has makes the assignment legal without resorting to `any`.
 */
type GuardContext = { request: Request; user?: DomainUser | null };

/**
 * `beforeHandle` guard: the route requires a signed-in user of any role.
 *
 * The guards below throw rather than returning an error object. A returned
 * object would be treated as a successful payload by the `onAfterHandle`
 * envelope in `app.ts` and go out as `{ success: true, data: { error:
 * 'Unauthorized' } }` with a 401 status — thrown errors route through
 * `handleApiError` instead and produce the correct `{ success: false, error: … }`
 * body.
 */
export const requireUser = ({ user }: GuardContext) => {
  if (!user) throw new UnauthorizedError('Authentication required');
};

/** Roles allowed to moderate content and read admin endpoints. */
export const ADMIN_ROLES = ['admin', 'super_admin', 'support'];

/** `beforeHandle` guard: admin, super_admin or support only. */
export const requireAdmin = ({ user }: GuardContext) => {
  if (!user) throw new UnauthorizedError('Authentication required');
  if (!ADMIN_ROLES.includes(user.role.toLowerCase())) {
    throw new ForbiddenError('Admin access only');
  }
};

/** `beforeHandle` guard: a freelancer marketplace account only. */
export const requireFreelancer = ({ user }: GuardContext) => {
  if (!user) throw new UnauthorizedError('Authentication required');
  if (user.role.toLowerCase() !== 'freelancer') {
    throw new ForbiddenError('Freelancer access only');
  }
};

/**
 * `beforeHandle` guard for the endpoints that shop-service and
 * freelancer-service exposed only to other services, authenticated with a
 * shared `x-internal-secret` header.
 *
 * Those callers are in-process now, so nothing should reach these routes over
 * HTTP. They are kept (and still guarded) for the deployment window where an
 * old container may still be pointing at them; see
 * `docs/microservices/merge-into-monolith.md`.
 */
export const requireInternal = ({ headers }: { headers: Record<string, string | undefined> }) => {
  const secret = process.env.INTERNAL_SERVICE_SECRET;
  if (!secret || headers['x-internal-secret'] !== secret) {
    throw new UnauthorizedError('Invalid internal service credentials');
  }
};
