import { Elysia, t } from 'elysia';
import { CamerasService } from './service';
import { fwd, requireUser } from '../../shared/http';

const createBody = t.Object({
  petId: t.Optional(t.String()),
  name: t.String(),
  streamUrl: t.Optional(t.String()),
});

const updateBody = t.Object({
  petId: t.Optional(t.String()),
  name: t.Optional(t.String()),
  streamUrl: t.Optional(t.String()),
  status: t.Optional(t.String()),
});

export const camerasController = new Elysia({ name: 'cameras-controller' }).group('/api/v1/video', (app) =>
  app
    .guard({ beforeHandle: requireUser }, (g) =>
      g
        .get('/cameras', async ({ user, set }: any) =>
          fwd(await CamerasService.list(user!.id), set))
        .post('/cameras', async ({ user, body, set }: any) =>
          fwd(await CamerasService.create(user!.id, body as any), set), { body: createBody })
        .get('/cameras/:id', async ({ user, params, set }: any) =>
          fwd(await CamerasService.get(user!.id, (params as any).id), set))
        .put('/cameras/:id', async ({ user, params, body, set }: any) =>
          fwd(await CamerasService.update(user!.id, (params as any).id, body as any), set), { body: updateBody })
        .delete('/cameras/:id', async ({ user, params, set }: any) =>
          fwd(await CamerasService.remove(user!.id, (params as any).id), set))
    )
);
