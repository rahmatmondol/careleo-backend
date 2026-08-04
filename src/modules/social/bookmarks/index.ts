import { Elysia } from 'elysia';
import { BookmarksService } from './service';
import { fwd } from '@/shared/http/service-result';
import { requireUser } from '@/shared/auth/domain-auth';

export const bookmarksController = new Elysia({ name: 'social-bookmarks-controller' }).group('/social', (app) =>
  app.guard({ beforeHandle: requireUser }, (g) =>
    g
      .get('/bookmarks', async ({ user, set }: any) =>
        fwd(await BookmarksService.list(user!.id), set))
      .post('/posts/:id/bookmark', async ({ user, params, set }: any) =>
        fwd(await BookmarksService.toggle((params as any).id, user!.id), set))
  )
);
