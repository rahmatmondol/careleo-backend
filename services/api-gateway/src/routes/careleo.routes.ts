import { Elysia } from 'elysia';
import { proxyRequest } from '../middleware/proxy';

// careleo-backend (modular monolith) handles everything except the
// standalone microservices (shop, social, video). This is the catch-all
// target for auth, pets, ai, vets, walkers, tasks, reminders, adoption,
// admin, notifications, sync, audit, etc.
const TARGET = Bun.env.CARELEO_SERVICE_URL || 'http://localhost:3000';

export const careleoRoutes = (app: Elysia) =>
  app.all('/api/v1/*', async ({ request, set }) => {
    try {
      return await proxyRequest(request, TARGET);
    } catch {
      set.status = 502;
      return { error: 'Bad Gateway', message: 'Careleo backend unreachable.' };
    }
  });
