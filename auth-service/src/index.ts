import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { jwt } from '@elysiajs/jwt';
import { AuthService } from './service';
import { requireAuth, requirePermission, requireRole } from './shared/auth/guards';
import { ROLE_PERMISSIONS } from './shared/auth/rbac';
import { AppError } from './shared/errors';
import { fail, ok } from './shared/http';
import { initDb } from './shared/db';

initDb();

const app = new Elysia()
  .use(cors())
  .use(
    jwt({
      name: 'jwt',
      secret: process.env.JWT_SECRET ?? 'careleo-dev-secret',
    })
  )
  .onError(({ code, error, set }) => {
    if (error instanceof AppError) {
      set.status = error.status;
      return fail(error.code, error.message, error.details);
    }

    if (code === 'VALIDATION') {
      set.status = 400;
      return fail('VALIDATION_ERROR', 'Invalid request payload', error);
    }

    set.status = 500;
    return fail('INTERNAL_SERVER_ERROR', 'Unexpected server error');
  })
  .get('/health', () => ok({ service: 'auth-service', status: 'ok' }))
  .group('/auth', (auth) =>
    auth
      /** Register a new user account. */
      .post('/register', async (ctx: any) => {
        const user = await AuthService.signup(ctx.body as Record<string, unknown>);
        const accessToken = await ctx.jwt.sign({ id: user.id, email: user.email, role: 'customer' });
        return ok({ accessToken, user });
      })
      /** Login and issue JWT access token. */
      .post('/login', async (ctx: any) => {
        const user = await AuthService.login(ctx.body as Record<string, unknown>);
        const accessToken = await ctx.jwt.sign({ id: user.id, email: user.email, role: user.role });
        return ok({ accessToken, user });
      })
      /** Request forgot-password reset token. */
      .post('/forgot-password', async ({ body }) => ok(await AuthService.forgotPassword(body as Record<string, unknown>)))
      /** Verify email using one-time token. */
      .post('/verify-email', async ({ body }) => ok(await AuthService.verifyEmail(body as Record<string, unknown>)))
      /** Create password with invite/setup token. */
      .post('/create-password', async ({ body }) => ok(await AuthService.createPassword(body as Record<string, unknown>)))
      /** Reset password with forgot-password token. */
      .post('/reset-password', async ({ body }) => ok(await AuthService.resetPassword(body as Record<string, unknown>)))
      /** Login/register user using Firebase ID token (dev token in local env). */
      .post('/firebase', async (ctx: any) => {
        const user = await AuthService.firebaseLogin(ctx.body as Record<string, unknown>);
        const accessToken = await ctx.jwt.sign({ id: user.id, email: user.email, role: user.role });
        return ok({ accessToken, user });
      })
      /** Get current authenticated user profile. */
      .get('/me', async (ctx: any) => {
        const authUser = await requireAuth(ctx.headers, ctx.jwt);
        return ok(await AuthService.me(authUser.id));
      })
      /** List role -> permission mapping. Restricted to admin/super_admin. */
      .get('/roles', async (ctx: any) => {
        const authUser = await requireAuth(ctx.headers, ctx.jwt);
        requireRole(authUser, ['super_admin', 'admin']);
        return ok(Object.entries(ROLE_PERMISSIONS).map(([role, permissions]) => ({ role, permissions })));
      })
      /** Check whether current user has a specific permission. */
      .post('/permissions/check', async (ctx: any) => {
        const authUser = await requireAuth(ctx.headers, ctx.jwt);
        const permission = String((ctx.body as Record<string, unknown>).permission ?? '');
        requirePermission(authUser, permission);
        return ok({ allowed: true, permission });
      })
  );

const port = Number(process.env.PORT ?? 3001);
app.listen(port);
console.log(`auth-service listening on http://localhost:${port}`);
