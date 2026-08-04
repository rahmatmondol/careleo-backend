import { Elysia } from 'elysia';
import { FeedService } from './service';
import { fwd } from '@/shared/http/service-result';
import { requireUser } from '@/shared/auth/domain-auth';

const page = (q: any) => Number(q?.page) || 1;
const limit = (q: any) => Number(q?.limit) || 20;

export const feedController = new Elysia({ name: 'social-feed-controller' }).group('/social', (app) =>
  app
    // "For You" — public global feed
    // `user` is optional here — the feed is public, but a signed-in caller
    // gets isLiked/isBookmarked/isMine filled in for each post.
    .get('/feed', async ({ user, query, set }: any) =>
      fwd(await FeedService.forYou(page(query), limit(query), user?.id), set))
    .get('/feed/trending', async ({ user, query, set }: any) =>
      fwd(await FeedService.trending(page(query), limit(query), user?.id), set))
    // Following feed — requires auth
    .guard({ beforeHandle: requireUser }, (g) =>
      g.get('/feed/following', async ({ user, query, set }: any) =>
        fwd(await FeedService.following(user!.id, page(query), limit(query)), set))
    )
);
