import { Elysia } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { hasPermission } from '../utils/common';

export const auth = new Elysia()
  .use(jwt({ name: 'jwt', secret: Bun.env.JWT_SECRET || 'super_secret_jwt_key_change_in_prod' }))
  .derive({ as: 'global' }, async ({ jwt, request }) => {
    const auth = request.headers.get('Authorization');
    let user = null;
    if (auth?.startsWith('Bearer ')) {
      try {
        const payload = await jwt.verify(auth.slice(7));
        if (payload) {
          // careleo-backend signs { id, email, role }; some tokens use `sub`.
          const userId = (payload.sub ?? (payload as any).id) as string | undefined;
          if (userId && typeof userId === 'string') {
            user = { id: userId, role: payload.role as string };
          }
        }
      } catch {}
    }
    return { user };
  });

export const requireAuth = ({ user, set }: any) => {
  if (!user) {
    set.status = 401;
    return { error: 'Unauthorized' };
  }
};

export const requirePermission = (permission: string) => ({ user, set }: any) => {
  if (!user) {
    set.status = 401;
    return { error: 'Unauthorized' };
  }
  const role = String((user as any).role || '').toUpperCase();
  if (!hasPermission(role, permission)) {
    set.status = 403;
    return { error: 'Forbidden', message: `Missing permission: ${permission}` };
  }
};
