import { Elysia, t } from 'elysia';
import { AdminService } from './service';
import { fwd } from '../../shared/http';
import { requireAdmin } from '../../middleware/auth';

const num = (v: any, d: number) => Number(v) || d;

export const adminController = new Elysia({ name: 'video-admin-controller' }).group('/api/v1/video/admin', (app) =>
  app.guard({ beforeHandle: requireAdmin }, (g) =>
    g
      // ─── Consultations ─────────────────────────────────
      .get('/consultations', async ({ query, set }: any) =>
        fwd(await AdminService.listConsultations({
          status: (query as any)?.status,
          vetId: (query as any)?.vetId,
          userId: (query as any)?.userId,
          page: num((query as any)?.page, 1),
          limit: num((query as any)?.limit, 20),
        }), set))
      .get('/consultations/:id', async ({ params, set }: any) =>
        fwd(await AdminService.getConsultation((params as any).id), set))
      .patch('/consultations/:id', async ({ params, body, set }: any) =>
        fwd(await AdminService.setConsultationStatus((params as any).id, (body as any).status), set), {
        body: t.Object({ status: t.String() }),
      })

      // ─── Cameras ───────────────────────────────────────
      .get('/cameras', async ({ query, set }: any) =>
        fwd(await AdminService.listCameras({
          status: (query as any)?.status,
          page: num((query as any)?.page, 1),
          limit: num((query as any)?.limit, 20),
        }), set))

      // ─── Sessions ──────────────────────────────────────
      .get('/sessions', async ({ query, set }: any) =>
        fwd(await AdminService.listSessions({
          status: (query as any)?.status,
          page: num((query as any)?.page, 1),
          limit: num((query as any)?.limit, 20),
        }), set))

      // ─── Analytics ─────────────────────────────────────
      .get('/analytics', async ({ set }: any) =>
        fwd(await AdminService.analytics(), set))
  )
);
