import { Elysia } from 'elysia';
import { proxyRequest } from '../middleware/proxy';

const TARGET = Bun.env.SOCIAL_SERVICE_URL || 'http://localhost:3008';

export const socialRoutes = (app: Elysia) =>
  app.all('/api/v1/social/*', async ({ request, set }) => {
    try {
      return await proxyRequest(request, TARGET);
    } catch {
      set.status = 502;
      return { error: 'Bad Gateway', message: 'Social service unreachable.' };
    }
  });
