import { Elysia } from 'elysia';
import { proxyRequest } from '../middleware/proxy';

const TARGET = Bun.env.SHOP_SERVICE_URL || 'http://localhost:3004';

export const shopRoutes = (app: Elysia) =>
  app.all('/api/v1/shop/*', async ({ request, set }) => {
    try {
      return await proxyRequest(request, TARGET);
    } catch {
      set.status = 502;
      return { error: 'Bad Gateway', message: 'Shop service unreachable.' };
    }
  });
