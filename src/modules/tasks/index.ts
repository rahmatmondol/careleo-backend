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
    /** Update task by id. Editing the task itself is owner-only. */
    .put('/:id', async (ctx: any) => {
      const { headers, jwt, params, body } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return TasksService.update(authUser.id, String(params.id), (body ?? {}) as Record<string, unknown>);
    })
    /**
     * Record what happened. Open to accepted caregivers too — whoever gave the
     * dose should be able to say so.
     */
    .post('/:id/complete', async (ctx: any) => {
      const { headers, jwt, params, body } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return TasksService.complete(authUser.id, String(params.id), {
        completedAt: (body as any)?.completedAt,
      });
    })
    /** Undo a completion — backs the app's 5-second Undo. */
    .post('/:id/uncomplete', async (ctx: any) => {
      const { headers, jwt, params } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return TasksService.uncomplete(authUser.id, String(params.id));
    })
    /** Deliberately not done, with a reason — not the same as forgotten. */
    .post('/:id/skip', async (ctx: any) => {
      const { headers, jwt, params, body } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return TasksService.skip(authUser.id, String(params.id), (body as any)?.reason);
    })
    /** Complete a whole batch — "the morning is done". */
    .post('/complete-many', async (ctx: any) => {
      const { headers, jwt, body } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return TasksService.completeMany(authUser.id, (body ?? {}) as Record<string, unknown>);
    })
    /**
     * Push a task forward. Called by the "Snooze" button on the notification
     * itself, so it must work with nothing but the task id.
     */
    .post('/:id/snooze', async (ctx: any) => {
      const { headers, jwt, params, body } = ctx;
      const authUser = await requireAuth(headers, jwt);
      const minutes = Number((body as any)?.minutes ?? 30);
      return TasksService.snooze(authUser.id, String(params.id), minutes);
    })
    /**
     * "Not now" on a full-screen alarm — leaves the task where it is and
     * records that the owner waved it off. Two of these and the task stops
     * being allowed to take over the screen.
     */
    .post('/:id/alarm-dismissed', async (ctx: any) => {
      const { headers, jwt, params } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return TasksService.dismissAlarm(authUser.id, String(params.id));
    })
    /** Delete task by id. */
    .delete('/:id', async (ctx: any) => {
      const { headers, jwt, params } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return TasksService.remove(authUser.id, String(params.id));
    }),
);
