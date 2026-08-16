import { Elysia } from 'elysia';
import { requireAuth } from '@/shared/auth/guards';
import { CaregiversService } from './service';

export const caregiversController = new Elysia({ name: 'caregivers-controller' })
  // The parameter must be `:id` — every other `/pets/:id/...` group uses that
  // name, and Elysia's router refuses two names for the same path segment.
  .group('/pets/:id/caregivers', (app) =>
    app
      /** Who helps look after this pet. Owner only. */
      .get('', async (ctx: any) => {
        const authUser = await requireAuth(ctx.headers, ctx.jwt);
        return CaregiversService.listForPet(authUser.id, String(ctx.params.id));
      })
      /** Invite somebody by email — they need not have an account yet. */
      .post('', async (ctx: any) => {
        const authUser = await requireAuth(ctx.headers, ctx.jwt);
        return CaregiversService.invite(authUser.id, String(ctx.params.id), (ctx.body ?? {}) as Record<string, unknown>);
      }),
  )
  .group('/caregivers', (app) =>
    app
      /** Invites waiting for me, and the pets I already help with. */
      .get('/invites', async (ctx: any) => {
        const authUser = await requireAuth(ctx.headers, ctx.jwt);
        return CaregiversService.myInvites(authUser.id);
      })
      .post('/:id/accept', async (ctx: any) => {
        const authUser = await requireAuth(ctx.headers, ctx.jwt);
        return CaregiversService.respond(authUser.id, String(ctx.params.id), true);
      })
      .post('/:id/decline', async (ctx: any) => {
        const authUser = await requireAuth(ctx.headers, ctx.jwt);
        return CaregiversService.respond(authUser.id, String(ctx.params.id), false);
      })
      /** Owner toggles a caregiver's backup alerts, or changes their relation. */
      .put('/:id', async (ctx: any) => {
        const authUser = await requireAuth(ctx.headers, ctx.jwt);
        return CaregiversService.update(authUser.id, String(ctx.params.id), (ctx.body ?? {}) as Record<string, unknown>);
      })
      .delete('/:id', async (ctx: any) => {
        const authUser = await requireAuth(ctx.headers, ctx.jwt);
        return CaregiversService.remove(authUser.id, String(ctx.params.id));
      }),
  );
