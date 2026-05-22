import { Elysia } from 'elysia';
import { UsersService } from './service';

export const usersController = new Elysia({ name: 'users-controller' }).group('/users', (app) =>
  app
    .get('', async () => UsersService.ping())
    .get('/:id', async () => UsersService.ping())
    .put('/:id', async () => UsersService.ping())
);
