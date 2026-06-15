import { Elysia, t } from 'elysia';
import {
  getCameras,
  getCamera,
  createCamera,
  updateCamera,
  deleteCamera,
} from '../handlers/cameras.handlers';

export const cameraRoutes = new Elysia()
  .get('/cameras', async ({ user, set }) => {
    try {
      const result = await getCameras(user!.id);
      return { cameras: result };
    } catch (error: any) {
      set.status = 500;
      return { error: 'Internal Server Error', message: error.message };
    }
  })
  .post('/cameras', async ({ user, body, set }) => {
    try {
      const result = await createCamera(user!.id, body as any);
      return { camera: result };
    } catch (error: any) {
      set.status = 500;
      return { error: 'Internal Server Error', message: error.message };
    }
  }, {
    body: t.Object({
      petId: t.Optional(t.String()),
      name: t.String(),
      streamUrl: t.Optional(t.String()),
    }),
  })
  .get('/cameras/:id', async ({ user, params, set }) => {
    try {
      const result = await getCamera(user!.id, params.id);
      if (!result) {
        set.status = 404;
        return { error: 'Camera not found' };
      }
      return { camera: result };
    } catch (error: any) {
      set.status = 500;
      return { error: 'Internal Server Error', message: error.message };
    }
  })
  .put('/cameras/:id', async ({ user, params, body, set }) => {
    try {
      const result = await updateCamera(user!.id, params.id, body as any);
      if (!result) {
        set.status = 404;
        return { error: 'Camera not found' };
      }
      return { camera: result };
    } catch (error: any) {
      set.status = 500;
      return { error: 'Internal Server Error', message: error.message };
    }
  }, {
    body: t.Object({
      petId: t.Optional(t.String()),
      name: t.Optional(t.String()),
      streamUrl: t.Optional(t.String()),
      status: t.Optional(t.String()),
    }),
  })
  .delete('/cameras/:id', async ({ user, params, set }) => {
    try {
      const result = await deleteCamera(user!.id, params.id);
      if (!result) {
        set.status = 404;
        return { error: 'Camera not found' };
      }
      return result;
    } catch (error: any) {
      set.status = 500;
      return { error: 'Internal Server Error', message: error.message };
    }
  });
