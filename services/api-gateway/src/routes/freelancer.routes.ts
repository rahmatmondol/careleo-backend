import { Elysia } from 'elysia';
import { proxyRequest } from '../middleware/proxy';

const TARGET = Bun.env.FREELANCER_SERVICE_URL || 'http://localhost:3020';

export const freelancerRoutes = (app: Elysia) =>
  app.all('/api/v1/freelancer/*', async ({ request, set }) => {
    try {
      return await proxyRequest(request, TARGET);
    } catch {
      set.status = 502;
      return { error: 'Bad Gateway', message: 'Freelancer service unreachable.' };
    }
  });
