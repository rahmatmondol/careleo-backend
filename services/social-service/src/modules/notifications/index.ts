import { Elysia } from 'elysia';
import { NotificationsService } from './service';
import { fwd, requireUser } from '../../shared/http';

export const notificationsController = new Elysia({ name: 'notifications-controller' }).group('/api/v1/social', (app) =>
  app.guard({ beforeHandle: requireUser }, (g) =>
    g
      .get('/notifications', async ({ user, set }: any) =>
        fwd(await NotificationsService.list(user!.id), set))
      .put('/notifications/:id/read', async ({ user, params, set }: any) =>
        fwd(await NotificationsService.markRead((params as any).id, user!.id), set))
  )
);
