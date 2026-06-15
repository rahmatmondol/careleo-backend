// =====================================
// Feed Routes — GET /feed, GET /feed/trending, GET /feed/following
// =====================================

import { Elysia } from 'elysia';
import { getFeed, getTrendingFeed, getFollowingFeed } from '../handlers/feed.handlers';

const fwd = (r: any, s: any) => { if (r?.status >= 400) s.status = r.status; return r; };

export const feedRoutes = (app: Elysia) =>
  app.group('/api/v1/social', (group) =>
    group
      .get('/feed', async ({ query, set }) =>
        fwd(await getFeed(Number((query as any)?.page) || 1, Number((query as any)?.limit) || 20), set))
      .get('/feed/trending', async ({ query, set }) =>
        fwd(await getTrendingFeed(Number((query as any)?.page) || 1, Number((query as any)?.limit) || 20), set))
      .guard({
        beforeHandle: ({ user, set }) => { if (!user) { set.status = 401; return { error: 'Unauthorized' }; } }
      }, (g) =>
        g.get('/feed/following', async ({ user, query, set }) =>
          fwd(await getFollowingFeed(user!.id, Number((query as any)?.page) || 1, Number((query as any)?.limit) || 20), set))
      )
  );
