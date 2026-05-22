import { Elysia } from 'elysia';
import { AdminService } from './service';
import { requireAuth, requirePermission } from '@/shared/auth/guards';
import { ok } from '@/shared/http/response';

export const adminController = new Elysia({ name: 'admin-controller' }).group('/admin', (app) =>
  app
    /**
     * Read admin dashboard summary (requires orders.read).
     */
    .get('/dashboard/summary', async (ctx: any) => {
      const { headers, jwt } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      return ok(await AdminService.ping());
    })
    /**
     * Read orders list in admin context (requires orders.read).
     */
    .get('/orders', async (ctx: any) => {
      const { headers, jwt } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      return ok(await AdminService.ping());
    })
);
