import { Elysia } from 'elysia';
import { requireAuth, requireRole } from '@/shared/auth/guards';
import { NotificationsService } from './service';
import { PreferencesService } from './preferences';

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
      })
      // ── Per-user delivery settings ──
      // Returns defaults for a user who has never opened the screen, so the app
      // never has to special-case "no row yet".
      .get('/preferences', async (ctx: any) => {
        const { headers, jwt } = ctx;
        const authUser = await requireAuth(headers, jwt);
        return PreferencesService.get(authUser.id);
      })
      .put('/preferences', async (ctx: any) => {
        const { headers, jwt, body } = ctx;
        const authUser = await requireAuth(headers, jwt);
        return PreferencesService.update(authUser.id, (body ?? {}) as Record<string, unknown>);
      })
      // ── User-facing notification list & badge ──
      .get('/', async (ctx: any) => {
        const { headers, jwt, query } = ctx;
        const authUser = await requireAuth(headers, jwt);
        const limit = Number((query as any)?.limit ?? 50);
        const cursor = String((query as any)?.cursor ?? '').trim() || undefined;
        return NotificationsService.listUserNotifications(authUser.id, Number.isNaN(limit) ? 50 : Math.min(100, Math.max(1, limit)), cursor);
      })
      .get('/unread-count', async (ctx: any) => {
        const { headers, jwt } = ctx;
        const authUser = await requireAuth(headers, jwt);
        return NotificationsService.countUnreadNotifications(authUser.id);
      })
      .put('/read/:id', async (ctx: any) => {
        const { headers, jwt, params } = ctx;
        const authUser = await requireAuth(headers, jwt);
        return NotificationsService.markNotificationRead(String(params.id), authUser.id);
      })
      .put('/read-all', async (ctx: any) => {
        const { headers, jwt } = ctx;
        const authUser = await requireAuth(headers, jwt);
        return NotificationsService.markAllNotificationsRead(authUser.id);
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
      })
      // ── Admin bell: real events derived from orders, reports, signups, … ──
      // `support` is included: the feed is read-only and moderation/support
      // staff need it as much as admins do.
      .get('/feed', async (ctx: any) => {
        const { headers, jwt, query } = ctx;
        const admin = await requireAuth(headers, jwt);
        requireRole(admin, ['super_admin', 'admin', 'support']);
        const limit = Number((query as any)?.limit ?? 30);
        return NotificationsService.adminFeed(admin.id, Number.isNaN(limit) ? 30 : Math.min(100, Math.max(1, limit)));
      })
      .put('/feed/read-all', async (ctx: any) => {
        const { headers, jwt } = ctx;
        const admin = await requireAuth(headers, jwt);
        requireRole(admin, ['super_admin', 'admin', 'support']);
        return NotificationsService.markAllAdminNotificationsRead(admin.id);
      })
      .put('/feed/read', async (ctx: any) => {
        const { headers, jwt, body } = ctx;
        const admin = await requireAuth(headers, jwt);
        requireRole(admin, ['super_admin', 'admin', 'support']);
        return NotificationsService.markAdminNotificationRead(admin.id, String((body as any)?.id ?? ''));
      }),
  );
