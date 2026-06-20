import { Elysia, t } from 'elysia';
import { AuthService } from './service';
import { fwd, requireUser } from '../../shared/http';
import { jwtPlugin } from '../../middleware/auth';

export const authController = new Elysia({ name: 'auth-controller' }).use(jwtPlugin).group('/api/v1/freelancer/auth', (app) =>
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
