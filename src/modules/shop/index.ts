import { Elysia } from 'elysia';
import { errorForStatus } from '@/shared/errors';
import { publicRoutes } from './routes/public.routes';
import { internalRoutes } from './routes/internal.routes';
import { adminRoutes } from './routes/admin.routes';
import { customerRoutes } from './routes/customer.routes';

/**
 * Shop / commerce module — formerly the standalone shop-service on port 3004.
 *
 * Route paths are unchanged. The service declared them in full
 * (`/api/v1/shop/products`); here the `/api/v1` half comes from the app-wide
 * prefix in `app.ts` and the `/shop` half from the group below, so the URL a
 * client sees is byte-for-byte what the gateway used to proxy.
 */

/**
 * Translate this module's failure convention into a thrown error.
 *
 * shop-service reported failures by *returning* `{ error, status }` and letting
 * each route set the HTTP status by hand. The rest of this app throws typed
 * errors and lets `app.ts` render one envelope. Without this hook a 404 from,
 * say, `getProductByIdController` would be serialised as a **success**:
 * `{ success: true, data: { error: 'Product not found' }, error: null }`.
 *
 * Doing it in one `onAfterHandle` rather than editing ~30 route handlers keeps
 * the controllers as plain functions, which is what makes them easy to call
 * directly from the AI tool dispatcher and the reorder job.
 */
const normaliseErrorReturns = (app: Elysia) =>
  app.onAfterHandle(({ response, set }) => {
    if (response instanceof Response) return response;
    if (!response || typeof response !== 'object') return response;

    const body = response as { error?: unknown; status?: unknown; message?: unknown };
    if (typeof body.error !== 'string') return response;

    /**
     * Two conventions have to be honoured. Most controllers carry the code in
     * the payload (`{ error, status: 404 }`); a few older ones instead assign
     * `set.status` and return only `{ error }`. Read the payload first, fall
     * back to whatever the handler put on `set`, and default to 400.
     */
    const status =
      typeof body.status === 'number'
        ? body.status
        : typeof set.status === 'number'
          ? set.status
          : 400;

    const message = typeof body.message === 'string' ? body.message : body.error;
    throw errorForStatus(status, message);
  });

export const shopController = new Elysia({ name: 'shop-controller' })
  .use(normaliseErrorReturns)
  .group('/shop', (app) =>
    app
      .use(publicRoutes)
      .use(internalRoutes)
      .use(adminRoutes)
      .use(customerRoutes),
  );

export { startSubscriptionRunner } from './jobs/subscription-runner';
