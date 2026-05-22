import { Elysia } from 'elysia';
import { RemindersService } from './service';

export const remindersController = new Elysia({ name: 'reminders-controller' }).group('/reminders', (app) =>
  app
    .get('', async () => RemindersService.ping())
    .post('', async () => RemindersService.ping())
    .put('/:id', async () => RemindersService.ping())
    .delete('/:id', async () => RemindersService.ping())
);
