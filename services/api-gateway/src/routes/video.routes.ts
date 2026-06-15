import { Elysia } from 'elysia';
import { proxyRequest } from '../middleware/proxy';

const TARGET = Bun.env.VIDEO_SERVICE_URL || 'http://localhost:3014';

export const videoRoutes = (app: Elysia) =>
  app.all('/api/v1/video/*', async ({ request, set }) => {
    try {
      return await proxyRequest(request, TARGET);
    } catch {
      set.status = 502;
      return { error: 'Bad Gateway', message: 'Video service unreachable.' };
    }
  });
