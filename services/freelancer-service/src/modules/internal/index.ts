import { Elysia, t } from 'elysia';
import { InternalService } from './service';
import { fwd, requireInternal } from '../../shared/http';

export const internalController = new Elysia({ name: 'internal-controller' }).group('/api/v1/freelancer/internal', (app) =>
  app.guard({ beforeHandle: requireInternal }, (g) =>
    g
      .post('/jobs', async ({ body, set }: any) =>
        fwd(await InternalService.createJob(body as any), set), {
        body: t.Object({
          customerId: t.String(),
          customerEmail: t.String(),
          petId: t.String(),
          petName: t.Optional(t.String()),
          profileId: t.String(),
          serviceId: t.Optional(t.String()),
          message: t.Optional(t.String()),
          proposedSchedule: t.Optional(t.String()),
        }),
      })
      .post('/auto-hire', async ({ body, set }: any) =>
        fwd(await InternalService.autoHire(body as any), set), {
        body: t.Object({
          customerId: t.String(),
          customerEmail: t.String(),
          petId: t.String(),
          petName: t.Optional(t.String()),
          serviceType: t.String(),
        }),
      })
      .get('/freelancers', async ({ query, set }: any) =>
        fwd(await InternalService.listForServiceType((query as any)?.serviceType ?? '', (query as any)?.location), set))
  )
);
