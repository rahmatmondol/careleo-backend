// =====================================
// JWT Auth Middleware (Social Service)
// =====================================

import { jwt } from '@elysiajs/jwt';
import { Elysia } from 'elysia';

export const jwtPlugin = jwt({ name: 'jwt', secret: process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_prod' });

export const authGuard = new Elysia()
  .use(jwtPlugin)
  .derive(async ({ jwt, headers: { authorization } }) => {
    let user: { id: string; role: string } | null = null;
    if (authorization?.startsWith('Bearer ')) {
      try {
        const payload = await jwt.verify(authorization.slice(7));
        if (payload && typeof payload.sub === 'string') user = { id: payload.sub, role: payload.role as string };
      } catch {}
    }
    return { user };
  });
