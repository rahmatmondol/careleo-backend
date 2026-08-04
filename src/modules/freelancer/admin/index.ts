import { Elysia, t } from 'elysia';
import { AdminService } from './service';
import { fwd } from '@/shared/http/service-result';
import { requireAdmin } from '@/shared/auth/domain-auth';

const num = (v: any, d: number) => Number(v) || d;

export const adminController = new Elysia({ name: 'freelancer-admin-controller' }).group('/freelancer/admin', (app) =>
  app.guard({ beforeHandle: requireAdmin }, (g) =>
    g
      // ─── Summary ──────────────────────────────────────────
      .get('/summary', async ({ set }: any) =>
        fwd(await AdminService.summary(), set))

      // ─── Freelancers ──────────────────────────────────────
      .get('/freelancers', async ({ query, set }: any) =>
        fwd(await AdminService.listFreelancers({
          page: num((query as any)?.page, 1), limit: num((query as any)?.limit, 20),
        }), set))
      .get('/freelancers/:id', async ({ params, set }: any) =>
        fwd(await AdminService.getFreelancer((params as any).id), set))
      .patch('/freelancers/:id/verify', async ({ params, body, set }: any) =>
        fwd(await AdminService.verifyFreelancer((params as any).id, Boolean((body as any).isVerified)), set), {
        body: t.Object({ isVerified: t.Boolean() }),
      })
      .patch('/freelancers/:id/status', async ({ params, body, set }: any) =>
        fwd(await AdminService.setFreelancerStatus((params as any).id, (body as any).status), set), {
        body: t.Object({ status: t.String() }),
      })
      .get('/freelancers/:id/performance', async ({ params, set }: any) =>
        fwd(await AdminService.getFreelancerPerformance((params as any).id), set))

      // ─── Gig moderation ───────────────────────────────────
      .get('/services', async ({ query, set }: any) =>
        fwd(await AdminService.listServices({
          status: (query as any)?.status,
          page: num((query as any)?.page, 1), limit: num((query as any)?.limit, 20),
        }), set))
      .patch('/services/:id/moderation', async ({ params, body, set }: any) =>
        fwd(await AdminService.setServiceModeration((params as any).id, (body as any).moderationStatus), set), {
        body: t.Object({ moderationStatus: t.String() }),
      })

      // ─── Earnings / payouts ───────────────────────────────
      .get('/earnings', async ({ query, set }: any) =>
        fwd(await AdminService.listEarnings({
          payoutStatus: (query as any)?.payoutStatus,
          page: num((query as any)?.page, 1), limit: num((query as any)?.limit, 20),
        }), set))
      .patch('/earnings/:id/payout', async ({ params, body, set }: any) =>
        fwd(await AdminService.setEarningPayout((params as any).id, body as any), set), {
        body: t.Object({ payoutStatus: t.String(), payoutRef: t.Optional(t.String()) }),
      })

      // ─── Review moderation ────────────────────────────────
      .patch('/reviews/:id/hide', async ({ params, set }: any) =>
        fwd(await AdminService.moderateReview((params as any).id, 'hidden'), set))

      // ─── Support tickets ──────────────────────────────────
      .get('/support/tickets', async ({ query, set }: any) =>
        fwd(await AdminService.listSupportTickets({
          status: (query as any)?.status,
          page: num((query as any)?.page, 1), limit: num((query as any)?.limit, 20),
        }), set))
      .get('/support/tickets/:id', async ({ params, set }: any) =>
        fwd(await AdminService.getSupportTicket((params as any).id), set))
      .patch('/support/tickets/:id', async ({ params, body, set }: any) =>
        fwd(await AdminService.updateSupportTicket((params as any).id, body as any), set), {
        body: t.Object({
          status: t.Optional(t.String()),
          assignedTo: t.Optional(t.String()),
          priority: t.Optional(t.String()),
        }),
      })
      .post('/support/tickets/:id/messages', async ({ user, params, body, set }: any) =>
        fwd(await AdminService.addTicketMessage((params as any).id, user!.id, (body as any).body), set), {
        body: t.Object({ body: t.String() }),
      })
  )
);
