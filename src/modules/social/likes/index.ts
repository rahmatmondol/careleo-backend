import { Elysia } from 'elysia';
import { LikesService } from './service';
import { fwd } from '@/shared/http/service-result';
import { requireUser } from '@/shared/auth/domain-auth';

export const likesController = new Elysia({ name: 'social-likes-controller' }).group('/social', (app) =>
  app
    .get('/posts/:id/likes', async ({ params, set }) =>
      fwd(await LikesService.list((params as any).id), set))
    .guard({ beforeHandle: requireUser }, (g) =>
      g.post('/posts/:id/like', async ({ user, params, set }: any) =>
        fwd(await LikesService.toggle((params as any).id, user!.id), set))
    )
);
