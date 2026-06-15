import { Elysia } from 'elysia';

export const healthRoutes = (app: Elysia) =>
  app.get('/health', () => ({
    status: 'ok',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
  }));
