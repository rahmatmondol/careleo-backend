import { Elysia, t } from 'elysia';
import { AuthService } from './service';
import { fwd } from '@/shared/http/service-result';
import { requireUser } from '@/shared/auth/domain-auth';

/**
 * Freelancer sign-up / sign-in.
 *
 * As a standalone service this registered its own `jwtPlugin`; it now signs with
 * the app-wide `jwt` instance from `app.ts` (`JWT_ACCESS_SECRET`), which is the
 * same secret docker-compose was already passing in to freelancer-service as
 * `JWT_SECRET`. Tokens minted here therefore verify against `domainAuth`
 * exactly as they did before the merge.
 *
 * Exported as `freelancerAuthController` so it cannot collide with the core
 * `authController` in `modules/auth`.
 */
export const freelancerAuthController = new Elysia({
  name: 'freelancer-auth-controller',
}).group('/freelancer/auth', (app) =>
  app
    .post('/register', async ({ body, jwt, set }: any) =>
      fwd(await AuthService.register(body as any, (p) => jwt.sign(p)), set), {
      body: t.Object({
        email: t.String(),
        password: t.String(),
        displayName: t.String(),
        phone: t.Optional(t.String()),
      }),
    })
    .post('/login', async ({ body, jwt, set }: any) =>
      fwd(await AuthService.login(body as any, (p) => jwt.sign(p)), set), {
      body: t.Object({ email: t.String(), password: t.String() }),
    })
    .guard({ beforeHandle: requireUser }, (g) =>
      g.get('/me', async ({ user, set }: any) => fwd(await AuthService.me(user!.id), set)))
);
