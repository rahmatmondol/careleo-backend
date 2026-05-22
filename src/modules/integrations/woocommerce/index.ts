import { Elysia } from 'elysia';
import { requireAuth } from '@/shared/auth/guards';
import { ValidationError } from '@/shared/errors';
import { WooCommerceService } from './service';

const webhookHandler = (eventType: string) =>
  async ({ request, headers }: any) => {
    const deliveryId = String(headers['x-wc-webhook-delivery-id'] ?? headers['x-wc-webhook-delivery'] ?? '');
    const webhookId = String(headers['x-wc-webhook-id'] ?? '');
    const signature = String(headers['x-wc-webhook-signature'] ?? '');

    if (!deliveryId) throw new ValidationError('Missing webhook delivery id');

    const rawBody = await request.text();
    const payload = rawBody ? JSON.parse(rawBody) : {};

    return WooCommerceService.handleWebhook({
      eventType,
      deliveryId,
      webhookId,
      signature,
      rawBody,
      payload,
    });
  };

export const wooCommerceController = new Elysia({ name: 'woo-controller' }).group('/integrations/woo', (app) =>
  app
    /** Check WooCommerce API connection. */
    .get('/connection/test', async (ctx: any) => {
      const { headers, jwt } = ctx;
      await requireAuth(headers, jwt);
      return WooCommerceService.testConnection();
    })
    /** Sync Woo products into local cache. */
    .post('/sync/products', async (ctx: any) => {
      const { headers, jwt, query } = ctx;
      await requireAuth(headers, jwt);
      return WooCommerceService.syncProducts(query as Record<string, unknown>);
    })
    /** Sync Woo orders into local cache. */
    .post('/sync/orders', async (ctx: any) => {
      const { headers, jwt, query } = ctx;
      await requireAuth(headers, jwt);
      return WooCommerceService.syncOrders(query as Record<string, unknown>);
    })
    /** Sync Woo customers into local cache. */
    .post('/sync/customers', async (ctx: any) => {
      const { headers, jwt, query } = ctx;
      await requireAuth(headers, jwt);
      return WooCommerceService.syncCustomers(query as Record<string, unknown>);
    })
    /** Read locally cached orders. */
    .get('/orders', async (ctx: any) => {
      const { headers, jwt } = ctx;
      await requireAuth(headers, jwt);
      return WooCommerceService.listCachedOrders();
    })
    /** Read one order directly from Woo API. */
    .get('/orders/:id', async (ctx: any) => {
      const { headers, jwt, params } = ctx;
      await requireAuth(headers, jwt);
      return WooCommerceService.getOrderById(String(params.id));
    })
    /** Read locally cached products. */
    .get('/products', async (ctx: any) => {
      const { headers, jwt } = ctx;
      await requireAuth(headers, jwt);
      return WooCommerceService.listCachedProducts();
    })
    /** Read one product directly from Woo API. */
    .get('/products/:id', async (ctx: any) => {
      const { headers, jwt, params } = ctx;
      await requireAuth(headers, jwt);
      return WooCommerceService.getProductById(String(params.id));
    })
    /** Woo webhook: product updated. */
    .post('/webhook/product-updated', webhookHandler('product-updated'))
    /** Woo webhook: order updated. */
    .post('/webhook/order-updated', webhookHandler('order-updated'))
    /** Woo webhook: order created. */
    .post('/webhook/order-created', webhookHandler('order-created')),
);
