import { Elysia } from 'elysia';
import { FollowsService } from './service';
import { fwd } from '@/shared/http/service-result';
import { requireUser } from '@/shared/auth/domain-auth';

export const followsController = new Elysia({ name: 'social-follows-controller' }).group('/social', (app) =>
  app
    .get('/users/:id/followers', async ({ params, set }) =>
      fwd(await FollowsService.followers((params as any).id), set))
    .get('/users/:id/following', async ({ params, set }) =>
      fwd(await FollowsService.following((params as any).id), set))
    .guard({ beforeHandle: requireUser }, (g) =>
      g
        .post('/users/:id/follow', async ({ user, params, set }: any) =>
          fwd(await FollowsService.follow(user!.id, (params as any).id), set))
        .delete('/users/:id/follow', async ({ user, params, set }: any) =>
          fwd(await FollowsService.unfollow(user!.id, (params as any).id), set))
    )
);
