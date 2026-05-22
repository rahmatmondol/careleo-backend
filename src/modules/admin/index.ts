import { Elysia } from 'elysia';
import { AdminService } from './service';

export const adminController = new Elysia({ name: 'admin-controller' }).group('/admin', (app) =>
  app
    .get('/dashboard/summary', async () => AdminService.ping())
    .get('/orders', async () => AdminService.ping())
);
