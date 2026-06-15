// =====================================
// Comments Routes — GET /posts/:id/comments, POST /posts/:id/comments, DELETE /comments/:id
// =====================================

import { Elysia, t } from 'elysia';
import { addComment, getComments, deleteComment } from '../handlers/comments.handlers';

const fwd = (r: any, s: any) => { if (r?.status >= 400) s.status = r.status; return r; };

export const commentsRoutes = (app: Elysia) =>
  app.group('/api/v1/social', (group) =>
    group
      // Public
      .get('/posts/:id/comments', async ({ params, set }) =>
        fwd(await getComments((params as any).id), set))
      // Auth-protected
      .guard({
        beforeHandle: ({ user, set }) => { if (!user) { set.status = 401; return { error: 'Unauthorized' }; } }
      }, (g) =>
        g
          .post('/posts/:id/comments', async ({ user, params, body, set }) =>
            fwd(await addComment((params as any).id, user!.id, (body as any).content), set), {
            body: t.Object({ content: t.String({ minLength: 1 }) })
          })
          .delete('/comments/:id', async ({ user, params, set }) =>
            fwd(await deleteComment((params as any).id, user!.id), set))
      )
  );
