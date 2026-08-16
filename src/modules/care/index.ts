import { Elysia } from 'elysia';
import { requireAuth } from '@/shared/auth/guards';
import { CareInsights } from './insights';
import { timingInsightFor } from '@/modules/tasks/adaptive';

const intParam = (value: unknown, fallback: number, max: number) => {
  const n = Number(value ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(n)));
};

export const careController = new Elysia({ name: 'care-controller' }).group('/care', (app) =>
  app
    /** How the last N days actually went, per pet. Backs the weekly report. */
    .get('/insights', async (ctx: any) => {
      const authUser = await requireAuth(ctx.headers, ctx.jwt);
      return CareInsights.summary(authUser.id, {
        days: intParam(ctx.query?.days, 7, 365),
        petId: String(ctx.query?.petId ?? '').trim() || undefined,
      });
    })
    /** Medication adherence on its own — the number to show a vet. */
    .get('/adherence', async (ctx: any) => {
      const authUser = await requireAuth(ctx.headers, ctx.jwt);
      return CareInsights.medicationAdherence(authUser.id, {
        days: intParam(ctx.query?.days, 30, 365),
        petId: String(ctx.query?.petId ?? '').trim() || undefined,
      });
    })
    /**
     * What the scheduler has learned about when this task really gets done.
     * Exposed so the app can explain a reminder that moved by itself.
     */
    .get('/timing', async (ctx: any) => {
      const authUser = await requireAuth(ctx.headers, ctx.jwt);
      const title = String(ctx.query?.title ?? '').trim();
      if (!title) return { samples: 0, medianOffsetMinutes: 0, suggestedShiftMinutes: 0 };
      const petId = String(ctx.query?.petId ?? '').trim() || null;
      return timingInsightFor(authUser.id, petId, title);
    }),
);
