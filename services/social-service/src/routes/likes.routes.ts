// =====================================
// Likes Routes — POST /posts/:id/like, GET /posts/:id/likes
// =====================================

import { Elysia } from 'elysia';
import { toggleLike, getLikes } from '../handlers/likes.handlers';

const fwd = (r: any, s: any) => { if (r?.status >= 400) s.status = r.status; return r; };

export const likesRoutes = (app: Elysia) =>
  app.group('/api/v1/social', (group) =>
    group
      // Public
      .get('/posts/:id/likes', async ({ params, set }) =>
        fwd(await getLikes((params as any).id), set))
      // Auth-protected
      .guard({
        beforeHandle: ({ user, set }) => { if (!user) { set.status = 401; return { error: 'Unauthorized' }; } }
      }, (g) =>
        g.post('/posts/:id/like', async ({ user, params, set }) =>
          fwd(await toggleLike((params as any).id, user!.id), set))
      )
  );
