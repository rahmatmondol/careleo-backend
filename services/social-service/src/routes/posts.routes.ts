// =====================================
// Posts Routes — GET /posts, POST /posts, GET /posts/:id, PUT /posts/:id, DELETE /posts/:id, GET /users/:userId/posts
// =====================================

import { Elysia, t } from 'elysia';
import { listPosts, createPost, getPost, updatePost, deletePost, getUserPosts } from '../handlers/posts.handlers';

const fwd = (r: any, s: any) => { if (r?.status >= 400) s.status = r.status; return r; };

export const postsRoutes = (app: Elysia) =>
  app.group('/api/v1/social', (group) =>
    group
      // Public
      .get('/posts', async ({ query, set }) =>
        fwd(await listPosts(Number((query as any)?.page) || 1, Number((query as any)?.limit) || 20), set))
      .get('/posts/:id', async ({ params, set }) =>
        fwd(await getPost((params as any).id), set))
      .get('/users/:id/posts', async ({ params, set }) =>
        fwd(await getUserPosts((params as any).id), set))
      // Auth-protected
      .guard({
        beforeHandle: ({ user, set }) => { if (!user) { set.status = 401; return { error: 'Unauthorized' }; } }
      }, (g) =>
        g
          .post('/posts', async ({ user, body, set }) =>
            fwd(await createPost(user!.id, body), set), {
            body: t.Object({
              content: t.Optional(t.String()),
              imageUrl: t.Optional(t.String()),
              videoUrl: t.Optional(t.String()),
              petId: t.Optional(t.String()),
            })
          })
          .put('/posts/:id', async ({ user, params, body, set }) =>
            fwd(await updatePost((params as any).id, user!.id, body), set), {
            body: t.Object({
              content: t.Optional(t.String()),
              imageUrl: t.Optional(t.String()),
              videoUrl: t.Optional(t.String()),
              petId: t.Optional(t.String()),
            })
          })
          .delete('/posts/:id', async ({ user, params, set }) =>
            fwd(await deletePost((params as any).id, user!.id), set))
      )
  );
