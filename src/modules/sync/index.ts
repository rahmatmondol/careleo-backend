import { Elysia } from 'elysia';
import { SyncService } from './service';

export const syncController = new Elysia({ name: 'sync-controller' }).group('/sync', (app) =>
  app
    .get('/status', async () => SyncService.ping())
    .post('/run', async () => SyncService.ping())
);
