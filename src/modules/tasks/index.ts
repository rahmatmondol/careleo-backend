import { Elysia } from 'elysia';
import { TasksService } from './service';

export const tasksController = new Elysia({ name: 'tasks-controller' }).group('/tasks', (app) =>
  app
    .get('', async () => TasksService.ping())
    .post('', async () => TasksService.ping())
    .get('/:id', async () => TasksService.ping())
    .put('/:id', async () => TasksService.ping())
    .delete('/:id', async () => TasksService.ping())
);
