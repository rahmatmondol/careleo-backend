// =====================================
// JWT Auth Middleware (Freelancer Service)
// =====================================
// Tokens are signed/verified with the SHARED JWT secret so a customer token
// (issued by careleo-backend) and a freelancer token (issued here) both work.

import { jwt } from '@elysiajs/jwt';
import { Elysia } from 'elysia';

if (!process.env.JWT_SECRET) {
  console.warn('⚠️  [freelancer-service] JWT_SECRET is not set — using an insecure fallback. Set JWT_SECRET in production.');
}

export const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_prod';
export const jwtPlugin = jwt({ name: 'jwt', secret: JWT_SECRET });

export const authGuard = new Elysia()
  .use(jwtPlugin)
  // `as: 'global'` so the derived `user` propagates into sibling route plugins.
  .derive({ as: 'global' }, async ({ jwt, headers: { authorization } }) => {
    let user: { id: string; role: string; email?: string } | null = null;
    if (authorization?.startsWith('Bearer ')) {
      try {
        const payload = await jwt.verify(authorization.slice(7));
        // careleo-backend signs with `sub`; this service also uses `sub`.
        if (payload && typeof payload.sub === 'string') {
          user = { id: payload.sub, role: payload.role as string, email: payload.email as string | undefined };
        }
      } catch {}
    }
    return { user };
  });

export const ADMIN_ROLES = ['admin', 'super_admin', 'support'];

export const requireAdmin = ({ user, set }: any) => {
  if (!user) {
    set.status = 401;
    return { error: 'Unauthorized' };
  }
  if (!ADMIN_ROLES.includes(String(user.role || '').toLowerCase())) {
    set.status = 403;
    return { error: 'Forbidden' };
  }
};

/** Only a logged-in freelancer (role issued by this service) may pass. */
export const requireFreelancer = ({ user, set }: any) => {
  if (!user) {
    set.status = 401;
    return { error: 'Unauthorized' };
  }
  if (String(user.role || '').toLowerCase() !== 'freelancer') {
    set.status = 403;
    return { error: 'Freelancer access only' };
  }
};
