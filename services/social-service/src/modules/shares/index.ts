import { Elysia, t } from 'elysia';
import { SharesService } from './service';
import { fwd, requireUser } from '../../shared/http';

export const sharesController = new Elysia({ name: 'shares-controller' }).group('/api/v1/social', (app) =>
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
