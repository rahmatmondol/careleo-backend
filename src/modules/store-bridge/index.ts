import { Elysia } from 'elysia';
import { requireAuth } from '@/shared/auth/guards';
import { StoreBridgeService } from './service';

export const storebridgeController = new Elysia({ name: 'store-bridge-controller' }).group('/store', (app) =>
  app
    /** Return storefront categories from Woo cached products. */
    .get('/categories', async (ctx: any) => {
      const { headers, jwt } = ctx;
      await requireAuth(headers, jwt);
      return StoreBridgeService.getCategories();
    })
    /** Return storefront products from Woo cache. */
    .get('/products', async (ctx: any) => {
      const { headers, jwt } = ctx;
      await requireAuth(headers, jwt);
      return StoreBridgeService.getProducts();
    })
    /** Return orders from Woo cache. */
    .get('/orders', async (ctx: any) => {
      const { headers, jwt } = ctx;
      await requireAuth(headers, jwt);
      return StoreBridgeService.getOrders();
    }),
);
