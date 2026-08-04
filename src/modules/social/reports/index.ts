import { Elysia, t } from 'elysia';
import { ReportsService } from './service';
import { fwd } from '@/shared/http/service-result';
import { requireUser } from '@/shared/auth/domain-auth';

export const reportsController = new Elysia({ name: 'social-reports-controller' }).group('/social', (app) =>
  app.guard({ beforeHandle: requireUser }, (g) =>
    g.post('/posts/:id/report', async ({ user, params, body, set }: any) =>
      fwd(await ReportsService.report((params as any).id, user!.id, (body as any).reason), set), {
      body: t.Object({ reason: t.String() }),
    })
  )
);
