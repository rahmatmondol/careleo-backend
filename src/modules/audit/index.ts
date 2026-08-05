import { Elysia } from 'elysia';
import { AuditService } from './service';
import { requireAuth, requirePermission } from '@/shared/auth/guards';
import { NotFoundError } from '@/shared/errors';

/**
 * Audit log listing.
 *
 * Both handlers used to return `ping()`, so the admin panel's audit page served
 * hardcoded rows: the compliance trail existed in the database but nothing
 * could read it.
 */
export const auditController = new Elysia({ name: 'audit-controller' }).group('/audit-logs', (app) =>
  app
    .get('', async (ctx: any) => {
      const user = await requireAuth(ctx.headers, ctx.jwt);
      requirePermission(user, 'users.read');
      const data = await AuditService.list(ctx.query ?? {});
      return { success: true, data, error: null };
    })
    .get('/:id', async (ctx: any) => {
      const user = await requireAuth(ctx.headers, ctx.jwt);
      requirePermission(user, 'users.read');
      const log = await AuditService.get(String(ctx.params.id));
      if (!log) throw new NotFoundError('Audit log not found');
      return { success: true, data: { log }, error: null };
    }),
);
