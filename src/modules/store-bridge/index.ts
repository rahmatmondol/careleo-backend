import { Elysia } from 'elysia';
import { StoreBridgeService } from './service';

export const storebridgeController = new Elysia({ name: 'store-bridge-controller' }).group('/store', (app) =>
  app
    .get('/categories', async () => StoreBridgeService.ping())
    .get('/products', async () => StoreBridgeService.ping())
    .get('/orders', async () => StoreBridgeService.ping())
);
