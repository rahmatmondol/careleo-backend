import { Elysia } from 'elysia';
import { TasksService } from './service';
import { requireAuth } from '@/shared/auth/guards';

export const tasksController = new Elysia({ name: 'tasks-controller' }).group('/tasks', (app) =>
  app
    /** List authenticated user's tasks. */
    .get('', async (ctx: any) => {
      const { headers, jwt } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return TasksService.list(authUser.id, (ctx.query as any)?.petId ?? undefined);
    })
    /** Create task. */
    .post('', async (ctx: any) => {
      const { headers, jwt, body } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return TasksService.create(authUser.id, body as Record<string, unknown>);
    })
    /** Get task by id. */
    .get('/:id', async (ctx: any) => {
      const { headers, jwt, params } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return TasksService.get(authUser.id, String(params.id));
    })
    /** Update task by id. */
    .put('/:id', async (ctx: any) => {
      const { headers, jwt, params, body } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return TasksService.update(authUser.id, String(params.id), body as Record<string, unknown>);
    })
    /** Delete task by id. */
    .delete('/:id', async (ctx: any) => {
      const { headers, jwt, params } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return TasksService.remove(authUser.id, String(params.id));
    }),
);
