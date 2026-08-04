import { Elysia } from 'elysia';
import { NotificationsService } from './service';
import { fwd } from '@/shared/http/service-result';
import { requireUser } from '@/shared/auth/domain-auth';

export const notificationsController = new Elysia({ name: 'social-notifications-controller' }).group('/social', (app) =>
  app.guard({ beforeHandle: requireUser }, (g) =>
    g
      .get('/notifications', async ({ user, set }: any) =>
        fwd(await NotificationsService.list(user!.id), set))
      .put('/notifications/:id/read', async ({ user, params, set }: any) =>
        fwd(await NotificationsService.markRead((params as any).id, user!.id), set))
  )
);
