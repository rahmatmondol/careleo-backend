import { Elysia } from 'elysia';
import { RemindersService } from './service';
import { requireAuth } from '@/shared/auth/guards';

export const remindersController = new Elysia({ name: 'reminders-controller' }).group('/reminders', (app) =>
  app
    /** List authenticated user's reminders. */
    .get('', async (ctx: any) => {
      const { headers, jwt } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return RemindersService.list(authUser.id);
    })
    /** Create reminder. */
    .post('', async (ctx: any) => {
      const { headers, jwt, body } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return RemindersService.create(authUser.id, body as Record<string, unknown>);
    })
    /** Get reminder by id. */
    .get('/:id', async (ctx: any) => {
      const { headers, jwt, params } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return RemindersService.get(authUser.id, String(params.id));
    })
    /** Update reminder by id. */
    .put('/:id', async (ctx: any) => {
      const { headers, jwt, params, body } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return RemindersService.update(authUser.id, String(params.id), body as Record<string, unknown>);
    })
    /** Delete reminder by id. */
    .delete('/:id', async (ctx: any) => {
      const { headers, jwt, params } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return RemindersService.remove(authUser.id, String(params.id));
    }),
);
