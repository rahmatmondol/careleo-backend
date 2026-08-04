import { Elysia, t } from 'elysia';
import { SharesService } from './service';
import { fwd } from '@/shared/http/service-result';
import { requireUser } from '@/shared/auth/domain-auth';

export const sharesController = new Elysia({ name: 'social-shares-controller' }).group('/social', (app) =>
  app
    .get('/posts/:id/shares', async ({ params, set }) =>
      fwd(await SharesService.list((params as any).id), set))
    .guard({ beforeHandle: requireUser }, (g) =>
      g.post('/posts/:id/share', async ({ user, params, body, set }: any) =>
        fwd(await SharesService.share((params as any).id, user!.id, (body as any)?.platform), set), {
        body: t.Optional(t.Object({ platform: t.Optional(t.String()) })),
      })
    )
);
