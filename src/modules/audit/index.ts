import { Elysia } from 'elysia';
import { AuditService } from './service';

export const auditController = new Elysia({ name: 'audit-controller' }).group('/audit-logs', (app) =>
  app
    .get('', async () => AuditService.ping())
    .get('/:id', async () => AuditService.ping())
);
