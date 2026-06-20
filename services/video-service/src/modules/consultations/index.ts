import { Elysia, t } from 'elysia';
import { ConsultationsService } from './service';
import { fwd, requireUser } from '../../shared/http';

const createBody = t.Object({
  vetId: t.String(),
  petId: t.Optional(t.String()),
  scheduledAt: t.String(),
  notes: t.Optional(t.String()),
});

export const consultationsController = new Elysia({ name: 'consultations-controller' }).group('/api/v1/video', (app) =>
  app
    .guard({ beforeHandle: requireUser }, (g) =>
      g
        .get('/consultations', async ({ user, query, set }: any) =>
          fwd(await ConsultationsService.list(user!.id, query as any), set))
        .post('/consultations', async ({ user, body, set }: any) =>
          fwd(await ConsultationsService.create(user!.id, body as any), set), { body: createBody })
        .get('/consultations/:id', async ({ user, params, set }: any) =>
          fwd(await ConsultationsService.get(user!.id, (params as any).id), set))
        .put('/consultations/:id/start', async ({ user, params, set }: any) =>
          fwd(await ConsultationsService.start(user!.id, (params as any).id), set))
        .put('/consultations/:id/end', async ({ user, params, set }: any) =>
          fwd(await ConsultationsService.end(user!.id, (params as any).id), set))
        .put('/consultations/:id/cancel', async ({ user, params, set }: any) =>
          fwd(await ConsultationsService.cancel(user!.id, (params as any).id), set))
        .get('/vet/:vetId/slots', async ({ params, query, set }: any) =>
          fwd(await ConsultationsService.vetSlots((params as any).vetId, (query as any)?.date), set))
    )
);
