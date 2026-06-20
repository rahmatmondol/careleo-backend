import { Elysia } from 'elysia';
import { BookmarksService } from './service';
import { fwd, requireUser } from '../../shared/http';

export const bookmarksController = new Elysia({ name: 'bookmarks-controller' }).group('/api/v1/social', (app) =>
  app.guard({ beforeHandle: requireUser }, (g) =>
    g
      .get('/bookmarks', async ({ user, set }: any) =>
        fwd(await BookmarksService.list(user!.id), set))
      .post('/posts/:id/bookmark', async ({ user, params, set }: any) =>
        fwd(await BookmarksService.toggle((params as any).id, user!.id), set))
  )
);
