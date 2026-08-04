import { Elysia, t } from 'elysia';
import { AdminService } from './service';
import { fwd } from '@/shared/http/service-result';
import { requireAdmin } from '@/shared/auth/domain-auth';

const num = (v: any, d: number) => Number(v) || d;
const boolParam = (v: any) => (v === undefined ? undefined : v === 'true' || v === true);

export const adminController = new Elysia({ name: 'social-admin-controller' }).group('/social/admin', (app) =>
  app.guard({ beforeHandle: requireAdmin }, (g) =>
    g
      // ─── Posts moderation ──────────────────────────────
      .get('/posts', async ({ query, set }: any) =>
        fwd(await AdminService.listPosts({
          status: (query as any)?.status,
          reported: boolParam((query as any)?.reported),
          page: num((query as any)?.page, 1),
          limit: num((query as any)?.limit, 20),
        }), set))
      .get('/posts/:id', async ({ params, set }: any) =>
        fwd(await AdminService.getPost((params as any).id), set))
      .patch('/posts/:id', async ({ params, body, set }: any) =>
        fwd(await AdminService.setPostStatus((params as any).id, (body as any).status), set), {
        body: t.Object({ status: t.String() }),
      })
      .delete('/posts/:id', async ({ params, set }: any) =>
        fwd(await AdminService.deletePost((params as any).id), set))

      // ─── Reports queue ─────────────────────────────────
      .get('/reports', async ({ query, set }: any) =>
        fwd(await AdminService.listReports((query as any)?.status, num((query as any)?.page, 1), num((query as any)?.limit, 20)), set))
      .patch('/reports/:id', async ({ user, params, body, set }: any) =>
        fwd(await AdminService.resolveReport((params as any).id, user!.id, (body as any).status), set), {
        body: t.Object({ status: t.String() }),
      })

      // ─── Analytics ─────────────────────────────────────
      .get('/analytics', async ({ set }: any) =>
        fwd(await AdminService.analytics(), set))
  )
);
