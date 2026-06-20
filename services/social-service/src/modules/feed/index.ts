import { Elysia } from 'elysia';
import { FeedService } from './service';
import { fwd, requireUser } from '../../shared/http';

const page = (q: any) => Number(q?.page) || 1;
const limit = (q: any) => Number(q?.limit) || 20;

export const feedController = new Elysia({ name: 'feed-controller' }).group('/api/v1/social', (app) =>
  app
    // "For You" — public global feed
    .get('/feed', async ({ query, set }) =>
      fwd(await FeedService.forYou(page(query), limit(query)), set))
    .get('/feed/trending', async ({ query, set }) =>
      fwd(await FeedService.trending(page(query), limit(query)), set))
    // Following feed — requires auth
    .guard({ beforeHandle: requireUser }, (g) =>
      g.get('/feed/following', async ({ user, query, set }: any) =>
        fwd(await FeedService.following(user!.id, page(query), limit(query)), set))
    )
);
