import { Elysia, t } from 'elysia';
import { CommentsService } from './service';
import { fwd } from '@/shared/http/service-result';
import { requireUser } from '@/shared/auth/domain-auth';

export const commentsController = new Elysia({ name: 'social-comments-controller' }).group('/social', (app) =>
  app
    .get('/posts/:id/comments', async ({ user, params, set }: any) =>
      fwd(await CommentsService.list((params as any).id, user?.id), set))
    .guard({ beforeHandle: requireUser }, (g) =>
      g
        .post('/posts/:id/comments', async ({ user, params, body, set }: any) =>
          fwd(await CommentsService.add((params as any).id, user!.id, (body as any).content, (body as any).parentId), set), {
          body: t.Object({ content: t.String(), parentId: t.Optional(t.String()) }),
        })
        .delete('/comments/:id', async ({ user, params, set }: any) =>
          fwd(await CommentsService.remove((params as any).id, user!.id), set))
        .post('/comments/:id/like', async ({ user, params, set }: any) =>
          fwd(await CommentsService.toggleLike((params as any).id, user!.id), set))
    )
);
