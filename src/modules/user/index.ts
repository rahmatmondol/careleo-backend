import { Elysia } from 'elysia';
import { UserService } from './service';

export const userController = new Elysia({ name: 'user-controller' }).group('/users', (app) =>
  app
    .get('/me', async () => UserService.getMe())
    .put('/me', async ({ body }) => UserService.updateMe(body as Record<string, unknown>))
);
