import { Elysia } from 'elysia';
import { AuthService } from './service';
import { requireAuth, requirePermission, requireRole } from '@/shared/auth/guards';
import { ROLE_PERMISSIONS } from '@/shared/auth/rbac';

export const authController = new Elysia({ name: 'auth-controller' }).group('/auth', (app) =>
  app
    /**
     * Register a new user account.
     */
    .post('/register', async (ctx: any) => {
      const { body, jwt } = ctx;
      const user = await AuthService.signup(body as Record<string, unknown>);
      const accessToken = await jwt.sign({ id: user.id, email: user.email, role: 'customer' });

      return {
        accessToken,
        user,
      };
    })
    /**
     * Login and issue JWT access token.
     */
    .post('/login', async (ctx: any) => {
      const { body, jwt } = ctx;
      const user = await AuthService.login(body as Record<string, unknown>);
      const accessToken = await jwt.sign({ id: user.id, email: user.email, role: user.role });

      return {
        accessToken,
        user,
      };
    })
    /**
     * Login/register user using Firebase ID token (Google or Email provider).
     */
    .post('/firebase', async (ctx: any) => {
      const { body, jwt } = ctx;
      const user = await AuthService.firebaseLogin(body as Record<string, unknown>);
      const accessToken = await jwt.sign({ id: user.id, email: user.email, role: user.role });

      return {
        accessToken,
        user,
      };
    })
    /**
     * Get current authenticated user profile.
     */
    .get('/me', async (ctx: any) => {
      const { headers, jwt } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return AuthService.me(authUser.id);
    })
    /**
     * List role -> permission mapping. Restricted to admin/super_admin.
     */
    .get('/roles', async (ctx: any) => {
      const { headers, jwt } = ctx;
      const authUser = await requireAuth(headers, jwt);
      requireRole(authUser, ['super_admin', 'admin']);

      return Object.entries(ROLE_PERMISSIONS).map(([role, permissions]) => ({ role, permissions }));
    })
    /**
     * Check whether current user has a specific permission.
     */
    .post('/permissions/check', async (ctx: any) => {
      const { headers, body, jwt } = ctx;
      const authUser = await requireAuth(headers, jwt);
      const permission = String((body as Record<string, unknown>).permission ?? '');
      requirePermission(authUser, permission as any);
      return { allowed: true, permission };
    })
);
