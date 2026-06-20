import { Elysia, t } from 'elysia';
import { ServicesService } from './service';
import { fwd } from '../../shared/http';
import { requireFreelancer } from '../../middleware/auth';

const num = (v: any, d: number) => Number(v) || d;

const createBody = t.Object({
  serviceType: t.String(),
  title: t.String(),
  description: t.Optional(t.String()),
  price: t.Number(),
  billingPeriod: t.Optional(t.String()),
});

const updateBody = t.Object({
  title: t.Optional(t.String()),
  description: t.Optional(t.String()),
  price: t.Optional(t.Number()),
  billingPeriod: t.Optional(t.String()),
  isActive: t.Optional(t.Boolean()),
});

export const servicesController = new Elysia({ name: 'services-controller' }).group('/api/v1/freelancer', (app) =>
  app
    // ─── Public search ──────────────────────────────────────
    .get('/services', async ({ query, set }: any) =>
      fwd(await ServicesService.search({
        serviceType: (query as any)?.serviceType,
        location: (query as any)?.location,
        minRating: (query as any)?.minRating !== undefined ? Number((query as any).minRating) : undefined,
        page: num((query as any)?.page, 1),
        limit: num((query as any)?.limit, 20),
      }), set))

    // ─── Freelancer self-service gigs ───────────────────────
    .guard({ beforeHandle: requireFreelancer }, (g) =>
      g
        .get('/me/services', async ({ user, set }: any) =>
          fwd(await ServicesService.listMine(user!.id), set))
        .post('/me/services', async ({ user, body, set }: any) =>
          fwd(await ServicesService.createMine(user!.id, body as any), set), { body: createBody })
        .put('/me/services/:id', async ({ user, params, body, set }: any) =>
          fwd(await ServicesService.updateMine(user!.id, (params as any).id, body as any), set), { body: updateBody })
        .delete('/me/services/:id', async ({ user, params, set }: any) =>
          fwd(await ServicesService.removeMine(user!.id, (params as any).id), set))
    )
);
