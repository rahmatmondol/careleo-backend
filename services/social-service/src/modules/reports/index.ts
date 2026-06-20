import { Elysia, t } from 'elysia';
import { ReportsService } from './service';
import { fwd, requireUser } from '../../shared/http';

export const reportsController = new Elysia({ name: 'reports-controller' }).group('/api/v1/social', (app) =>
  app.guard({ beforeHandle: requireUser }, (g) =>
    g.post('/posts/:id/report', async ({ user, params, body, set }: any) =>
      fwd(await ReportsService.report((params as any).id, user!.id, (body as any).reason), set), {
      body: t.Object({ reason: t.String() }),
    })
  )
);
