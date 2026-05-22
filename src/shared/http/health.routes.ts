import { Elysia } from 'elysia';

export const healthRoutes = new Elysia({ name: 'health' })
  .get('/health', () => ({ success: true, status: 'ok' }))
  .get('/ready', () => ({ success: true, status: 'ready' }));
