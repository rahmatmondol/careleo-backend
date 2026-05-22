import { Elysia } from 'elysia';
import { AuthService } from './service';
import { requireAuth, requirePermission, requireRole } from '@/shared/auth/guards';
import { ROLE_PERMISSIONS } from '@/shared/auth/rbac';

export const authController = new Elysia({ name: 'auth-controller' }).group('/auth', (app) =>
  app
    .post('/signup', async ({ body }) => {
      const user = await AuthService.signup(body as Record<string, unknown>);
      return user;
    })
    .post('/login', async ({ body, jwt }) => {
      const user = await AuthService.login(body as Record<string, unknown>);
      const accessToken = await jwt.sign({ id: user.id, email: user.email, role: user.role });

      return {
        accessToken,
        user,
      };
    })
    .get('/me', async ({ headers, jwt }) => {
      const authUser = await requireAuth(headers, jwt);
      return AuthService.me(authUser.id);
    })
    .get('/roles', async ({ headers, jwt }) => {
      const authUser = await requireAuth(headers, jwt);
      requireRole(authUser, ['super_admin', 'admin']);

      return Object.entries(ROLE_PERMISSIONS).map(([role, permissions]) => ({ role, permissions }));
    })
    .post('/permissions/check', async ({ headers, body, jwt }) => {
      const authUser = await requireAuth(headers, jwt);
      const permission = String((body as Record<string, unknown>).permission ?? '');
      requirePermission(authUser, permission as any);
      return { allowed: true, permission };
    })
);
