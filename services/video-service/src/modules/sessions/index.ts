import { Elysia } from 'elysia';
import { SessionsService } from './service';
import { fwd, requireUser } from '../../shared/http';

export const sessionsController = new Elysia({ name: 'sessions-controller' }).group('/api/v1/video', (app) =>
  app
    .guard({ beforeHandle: requireUser }, (g) =>
      g
        .get('/sessions', async ({ user, query, set }: any) =>
          fwd(await SessionsService.list(user!.id, query as any), set))
        .get('/sessions/:id', async ({ user, params, set }: any) =>
          fwd(await SessionsService.get(user!.id, (params as any).id), set))
        .put('/sessions/:id/end', async ({ user, params, set }: any) =>
          fwd(await SessionsService.end(user!.id, (params as any).id), set))
    )
);
