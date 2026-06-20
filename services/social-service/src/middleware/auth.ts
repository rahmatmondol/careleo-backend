// =====================================
// JWT Auth Middleware (Social Service)
// =====================================

import { jwt } from '@elysiajs/jwt';
import { Elysia } from 'elysia';

if (!process.env.JWT_SECRET) {
  console.warn('⚠️  [social-service] JWT_SECRET is not set — using an insecure fallback. Set JWT_SECRET in production.');
}

export const jwtPlugin = jwt({ name: 'jwt', secret: process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_prod' });

export const authGuard = new Elysia()
  .use(jwtPlugin)
  // `as: 'global'` so the derived `user` propagates into sibling route plugins.
  // With default (local) scope, route modules used after this one see `user`
  // as undefined and every beforeHandle guard would 401.
  .derive({ as: 'global' }, async ({ jwt, headers: { authorization } }) => {
    let user: { id: string; role: string } | null = null;
    if (authorization?.startsWith('Bearer ')) {
      try {
        const payload = await jwt.verify(authorization.slice(7));
        if (payload && typeof payload.sub === 'string') user = { id: payload.sub, role: payload.role as string };
      } catch {}
    }
    return { user };
  });

/**
 * beforeHandle guard for admin-only routes. social-service has no full RBAC
 * table (unlike the monolith); a coarse role check is enough for moderation.
 * Roles are lowercase snake_case on the backend (see CLAUDE.md).
 */
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
