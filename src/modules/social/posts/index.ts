import { Elysia, t } from 'elysia';
import { PostsService } from './service';
import { fwd } from '@/shared/http/service-result';
import { requireUser } from '@/shared/auth/domain-auth';

const postBody = t.Object({
  content: t.Optional(t.String()),
  imageUrl: t.Optional(t.String()),
  videoUrl: t.Optional(t.String()),
  petId: t.Optional(t.String()),
});

export const postsController = new Elysia({ name: 'social-posts-controller' }).group('/social', (app) =>
  app
    // ─── Public reads ───────────────────────────────────────
    .get('/posts', async ({ user, query, set }: any) =>
      fwd(await PostsService.list(Number((query as any)?.page) || 1, Number((query as any)?.limit) || 20, user?.id), set))
    .get('/posts/:id', async ({ user, params, set }: any) =>
      fwd(await PostsService.get((params as any).id, user?.id), set))
    .get('/users/:id/posts', async ({ user, params, set }: any) =>
      fwd(await PostsService.listByUser((params as any).id, user?.id), set))

    // ─── Auth-protected writes ──────────────────────────────
    .guard({ beforeHandle: requireUser }, (g) =>
      g
        .post('/posts', async ({ user, body, set }: any) =>
          fwd(await PostsService.create(user!.id, body as any), set), { body: postBody })
        .put('/posts/:id', async ({ user, params, body, set }: any) =>
          fwd(await PostsService.update((params as any).id, user!.id, body as any), set), { body: postBody })
        .delete('/posts/:id', async ({ user, params, set }: any) =>
          fwd(await PostsService.remove((params as any).id, user!.id), set))
    )
);
