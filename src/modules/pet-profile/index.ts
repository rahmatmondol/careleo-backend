import { Elysia } from 'elysia';
import { requireAuth } from '@/shared/auth/guards';
import { PetProfileService } from './service';

/**
 * Pet profile + learned-facts API. Mounted under /pets/:petId so it sits with
 * the rest of the pet domain. Every handler authenticates and the service
 * enforces pet ownership.
 */
export const petProfileController = new Elysia({ name: 'pet-profile-controller' }).group(
  '/pets/:id',
  (app) =>
    app
      /** Structured profile + active facts. */
      .get('/profile', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        return PetProfileService.getProfile(user.id, String(ctx.params.id));
      })
      /** Patch structured profile fields. */
      .put('/profile', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        return PetProfileService.updateProfile(user.id, String(ctx.params.id), (ctx.body ?? {}) as Record<string, unknown>);
      })
      /** Submit doctor-style profiling Q&A answers. */
      .post('/profile/answers', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        const body = (ctx.body ?? {}) as Record<string, unknown>;
        const answers = Array.isArray(body.answers) ? (body.answers as any[]) : [];
        return PetProfileService.saveProfilingAnswers(user.id, String(ctx.params.id), answers);
      })
      /** List active learned facts. */
      .get('/facts', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        return PetProfileService.listFacts(user.id, String(ctx.params.id));
      })
      /** Manually add a fact. */
      .post('/facts', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        const body = (ctx.body ?? {}) as Record<string, unknown>;
        return PetProfileService.addManualFact(user.id, String(ctx.params.id), String(body.fact ?? ''), body.category as string | undefined);
      })
      /** Delete a fact. */
      .delete('/facts/:factId', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        return PetProfileService.deleteFact(user.id, String(ctx.params.id), String(ctx.params.factId));
      }),
);
