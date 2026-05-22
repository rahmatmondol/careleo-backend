import { Elysia } from 'elysia';
import { AuthService } from './service';
import { requireAuth, requirePermission, requireRole } from '@/shared/auth/guards';
import { ROLE_PERMISSIONS } from '@/shared/auth/rbac';
import { ok } from '@/shared/http/response';

export const authController = new Elysia({ name: 'auth-controller' }).group('/auth', (app) =>
  app
    /**
     * Register a new user account.
     */
    .post('/signup', async ({ body }) => {
      const user = await AuthService.signup(body as Record<string, unknown>);
      return ok(user);
    })
    /**
     * Login and issue JWT access token.
     */
    .post('/login', async (ctx: any) => {
      const { body, jwt } = ctx;
      const user = await AuthService.login(body as Record<string, unknown>);
      const accessToken = await jwt.sign({ id: user.id, email: user.email, role: user.role });

      return ok({
        accessToken,
        user,
      });
    })
    /**
     * Get current authenticated user profile.
     */
    .get('/me', async (ctx: any) => {
      const { headers, jwt } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return ok(await AuthService.me(authUser.id));
    })
    /**
     * List role -> permission mapping. Restricted to admin/super_admin.
     */
    .get('/roles', async (ctx: any) => {
      const { headers, jwt } = ctx;
      const authUser = await requireAuth(headers, jwt);
      requireRole(authUser, ['super_admin', 'admin']);

      return ok(Object.entries(ROLE_PERMISSIONS).map(([role, permissions]) => ({ role, permissions })));
    })
    /**
     * Check whether current user has a specific permission.
     */
    .post('/permissions/check', async (ctx: any) => {
      const { headers, body, jwt } = ctx;
      const authUser = await requireAuth(headers, jwt);
      const permission = String((body as Record<string, unknown>).permission ?? '');
      requirePermission(authUser, permission as any);
      return ok({ allowed: true, permission });
    })
);
