import { Elysia, t } from 'elysia';
import { JobsService } from './service';
import { fwd } from '@/shared/http/service-result';
import { requireFreelancer, requireUser } from '@/shared/auth/domain-auth';

const jobBody = t.Object({
  customerEmail: t.String(),
  petId: t.String(),
  petName: t.Optional(t.String()),
  profileId: t.String(),
  serviceId: t.Optional(t.String()),
  message: t.Optional(t.String()),
  proposedSchedule: t.Optional(t.String()),
});

export const jobsController = new Elysia({ name: 'freelancer-jobs-controller' }).group('/freelancer', (app) =>
  app
    // ─── Customer routes (any logged-in user) ───────────────
    .guard({ beforeHandle: requireUser }, (g) =>
      g
        .post('/jobs', async ({ user, body, set }: any) =>
          fwd(await JobsService.sendJobLetter(user!.id, body as any), set), { body: jobBody })
        .get('/jobs', async ({ user, set }: any) =>
          fwd(await JobsService.listCustomerJobs(user!.id), set))
        .get('/jobs/:id', async ({ user, params, set }: any) =>
          fwd(await JobsService.getCustomerJob(user!.id, (params as any).id), set))
    )

    // ─── Freelancer routes ──────────────────────────────────
    .guard({ beforeHandle: requireFreelancer }, (g) =>
      g
        .get('/me/jobs', async ({ user, query, set }: any) =>
          fwd(await JobsService.listFreelancerJobs(user!.id, (query as any)?.status), set))
        .post('/me/jobs/:id/respond', async ({ user, params, body, set }: any) =>
          fwd(await JobsService.respond(user!.id, (params as any).id, (body as any).action), set), {
          body: t.Object({ action: t.Union([t.Literal('accepted'), t.Literal('declined')]) }),
        })
    )
);
