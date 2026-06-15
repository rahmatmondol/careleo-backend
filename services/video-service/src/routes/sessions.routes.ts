import { Elysia } from 'elysia';
import {
  getSessions,
  getSession,
  endSession,
} from '../handlers/sessions.handlers';

export const sessionRoutes = new Elysia()
  .get('/sessions', async ({ user, query, set }) => {
    try {
      const result = await getSessions(user!.id, query as any);
      return { sessions: result };
    } catch (error: any) {
      set.status = 500;
      return { error: 'Internal Server Error', message: error.message };
    }
  })
  .get('/sessions/:id', async ({ user, params, set }) => {
    try {
      const result = await getSession(user!.id, params.id);
      if (!result) {
        set.status = 404;
        return { error: 'Session not found' };
      }
      return { session: result };
    } catch (error: any) {
      set.status = 500;
      return { error: 'Internal Server Error', message: error.message };
    }
  })
  .put('/sessions/:id/end', async ({ user, params, set }) => {
    try {
      const result = await endSession(user!.id, params.id);
      if (!result) {
        set.status = 404;
        return { error: 'Session not found' };
      }
      return { session: result };
    } catch (error: any) {
      set.status = 500;
      return { error: 'Internal Server Error', message: error.message };
    }
  });
