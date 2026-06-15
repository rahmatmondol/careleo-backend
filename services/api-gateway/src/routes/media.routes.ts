import { Elysia } from 'elysia';
import { proxyRequest } from '../middleware/proxy';

const TARGET = Bun.env.MEDIA_SERVICE_URL || 'http://localhost:3017';

export const mediaRoutes = (app: Elysia) =>
  app.all('/api/v1/media/*', async ({ request, set }) => {
    try {
      return await proxyRequest(request, TARGET);
    } catch {
      set.status = 502;
      return { error: 'Bad Gateway', message: 'Media service unreachable.' };
    }
  });
