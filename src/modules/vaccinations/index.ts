import { Elysia } from 'elysia';
import { requireAuth } from '@/shared/auth/guards';
import { VaccinationsService } from './service';

/** Vaccination records, mounted under /pets/:id (param :id to match pets controller). */
export const vaccinationsController = new Elysia({ name: 'vaccinations-controller' }).group(
  '/pets/:id',
  (app) =>
    app
      .get('/vaccinations', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        return VaccinationsService.list(user.id, String(ctx.params.id));
      })
      .post('/vaccinations', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        return VaccinationsService.add(user.id, String(ctx.params.id), (ctx.body ?? {}) as Record<string, unknown>);
      }),
);
