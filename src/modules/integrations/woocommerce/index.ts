import { Elysia } from 'elysia';
import { WooCommerceService } from './service';

export const wooCommerceController = new Elysia({ name: 'woo-controller' }).group('/integrations/woo', (app) =>
  app
    .post('/webhook/product-updated', async () => WooCommerceService.handleWebhook('product-updated'))
    .post('/webhook/order-updated', async () => WooCommerceService.handleWebhook('order-updated'))
    .post('/webhook/order-created', async () => WooCommerceService.handleWebhook('order-created'))
);
