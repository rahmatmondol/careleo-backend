import { Elysia, t } from 'elysia';
import { BookingsService } from './service';
import { fwd, requireUser } from '../../shared/http';
import { requireFreelancer } from '../../middleware/auth';

export const bookingsController = new Elysia({ name: 'bookings-controller' }).group('/api/v1/freelancer', (app) =>
  app
    // ─── Customer ────────────────────────────────────────────
    .guard({ beforeHandle: requireUser }, (g) =>
      g
        .get('/me/bookings', async ({ user, set }: any) =>
          fwd(await BookingsService.listMineCustomer(user!.id), set))
        .post('/me/bookings/:id/review', async ({ user, params, body, set }: any) =>
          fwd(await BookingsService.leaveReview(user!.id, (params as any).id, body as any), set), {
          body: t.Object({ rating: t.Number(), comment: t.Optional(t.String()) }),
        })
    )

    // ─── Freelancer ──────────────────────────────────────────
    .guard({ beforeHandle: requireFreelancer }, (g) =>
      g
        .get('/me/freelancer/bookings', async ({ user, set }: any) =>
          fwd(await BookingsService.listMineFreelancer(user!.id), set))
        .post('/me/freelancer/bookings/:id/complete', async ({ user, params, set }: any) =>
          fwd(await BookingsService.complete(user!.id, (params as any).id), set))
    )
);
