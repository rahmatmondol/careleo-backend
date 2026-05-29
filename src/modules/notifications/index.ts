import { Elysia } from 'elysia';
import { requireAuth, requireRole } from '@/shared/auth/guards';
import { NotificationsService } from './service';

export const notificationsController = new Elysia({ name: 'notifications-controller' })
  .group('/notifications', (app) =>
    app
      .post('/test-push', async (ctx: any) => {
        const { headers, jwt, body } = ctx;
        const authUser = await requireAuth(headers, jwt);

        const title = String((body as any)?.title ?? 'Test notification').trim();
        const message = String((body as any)?.body ?? 'Push notification is working').trim();
        const data = (body as any)?.data && typeof (body as any).data === 'object' ? (body as any).data : undefined;

        return NotificationsService.sendToUsers(
          [authUser.id],
          { title, body: message, data, type: 'TEST_PUSH' },
          { targetMode: 'single' },
        );
      })
      .post('/device-token', async (ctx: any) => {
        const { headers, jwt, body } = ctx;
        const authUser = await requireAuth(headers, jwt);
        return NotificationsService.registerDeviceToken(authUser.id, body as Record<string, unknown>);
      })
      .delete('/device-token', async (ctx: any) => {
        const { headers, jwt, body } = ctx;
        const authUser = await requireAuth(headers, jwt);
        return NotificationsService.removeDeviceToken(authUser.id, body as Record<string, unknown>);
      }),
  )
  .group('/admin/notifications', (app) =>
    app
      .post('/send-single', async (ctx: any) => {
        const { headers, jwt, body } = ctx;
        const admin = await requireAuth(headers, jwt);
        requireRole(admin, ['super_admin', 'admin']);
        return NotificationsService.sendAdminSingle(admin.id, body as Record<string, unknown>);
      })
      .post('/send-all', async (ctx: any) => {
        const { headers, jwt, body } = ctx;
        const admin = await requireAuth(headers, jwt);
        requireRole(admin, ['super_admin', 'admin']);
        return NotificationsService.sendAdminBroadcast(admin.id, body as Record<string, unknown>);
      })
      .post('/send-custom-list', async (ctx: any) => {
        const { headers, jwt, body } = ctx;
        const admin = await requireAuth(headers, jwt);
        requireRole(admin, ['super_admin', 'admin']);
        return NotificationsService.sendAdminCustomList(admin.id, body as Record<string, unknown>);
      })
      .get('/logs', async (ctx: any) => {
        const { headers, jwt, query } = ctx;
        const admin = await requireAuth(headers, jwt);
        requireRole(admin, ['super_admin', 'admin']);
        const limit = Number((query as any)?.limit ?? 50);
        return NotificationsService.logList(Number.isNaN(limit) ? 50 : Math.min(100, Math.max(1, limit)));
      }),
  );
