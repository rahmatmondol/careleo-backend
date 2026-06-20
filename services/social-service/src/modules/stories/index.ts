import { Elysia, t } from 'elysia';
import { StoriesService } from './service';
import { fwd, requireUser } from '../../shared/http';

export const storiesController = new Elysia({ name: 'stories-controller' }).group('/api/v1/social', (app) =>
  app
    .get('/stories', async ({ set }) =>
      fwd(await StoriesService.listActive(), set))
    .guard({ beforeHandle: requireUser }, (g) =>
      g
        .post('/stories', async ({ user, body, set }: any) =>
          fwd(await StoriesService.create(user!.id, body as any), set), {
          body: t.Object({ imageUrl: t.String(), caption: t.Optional(t.String()), petId: t.Optional(t.String()) }),
        })
        .delete('/stories/:id', async ({ user, params, set }: any) =>
          fwd(await StoriesService.remove((params as any).id, user!.id), set))
    )
);
