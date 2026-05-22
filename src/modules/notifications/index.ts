import { Elysia } from 'elysia';
import { requireAuth } from '@/shared/auth/guards';
import { NotificationsService } from './service';

export const notificationsController = new Elysia({ name: 'notifications-controller' }).group(
  '/notifications',
  (app) =>
    app
      /**
       * Register/refresh device token for the logged-in user.
       */
      .post('/device-token', async (ctx: any) => {
        const { headers, jwt, body } = ctx;
        const authUser = await requireAuth(headers, jwt);
        return NotificationsService.registerDeviceToken(authUser.id, body as Record<string, unknown>);
      })
      /**
       * Remove (deactivate) device token for the logged-in user.
       */
      .delete('/device-token', async (ctx: any) => {
        const { headers, jwt, body } = ctx;
        const authUser = await requireAuth(headers, jwt);
        return NotificationsService.removeDeviceToken(authUser.id, body as Record<string, unknown>);
      }),
);
