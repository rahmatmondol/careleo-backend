import { Elysia, t } from 'elysia';
import {
  getConsultations,
  getConsultation,
  createConsultation,
  startConsultation,
  endConsultation,
  cancelConsultation,
  getVetSlots,
} from '../handlers/consultations.handlers';

export const consultationRoutes = new Elysia()
  .get('/consultations', async ({ user, query, set }) => {
    try {
      const result = await getConsultations(user!.id, query as any);
      return { consultations: result };
    } catch (error: any) {
      set.status = 500;
      return { error: 'Internal Server Error', message: error.message };
    }
  })
  .post('/consultations', async ({ user, body, set }) => {
    try {
      const result = await createConsultation(user!.id, body as any);
      return { consultation: result };
    } catch (error: any) {
      set.status = 500;
      return { error: 'Internal Server Error', message: error.message };
    }
  }, {
    body: t.Object({
      vetId: t.String(),
      petId: t.Optional(t.String()),
      scheduledAt: t.String(),
      notes: t.Optional(t.String()),
    }),
  })
  .get('/consultations/:id', async ({ user, params, set }) => {
    try {
      const result = await getConsultation(user!.id, params.id);
      if (!result) {
        set.status = 404;
        return { error: 'Consultation not found' };
      }
      return { consultation: result };
    } catch (error: any) {
      set.status = 500;
      return { error: 'Internal Server Error', message: error.message };
    }
  })
  .put('/consultations/:id/start', async ({ user, params, set }) => {
    try {
      const result = await startConsultation(user!.id, params.id);
      if (!result) {
        set.status = 404;
        return { error: 'Consultation not found' };
      }
      return { consultation: result };
    } catch (error: any) {
      set.status = 500;
      return { error: 'Internal Server Error', message: error.message };
    }
  })
  .put('/consultations/:id/end', async ({ user, params, set }) => {
    try {
      const result = await endConsultation(user!.id, params.id);
      if (!result) {
        set.status = 404;
        return { error: 'Consultation not found' };
      }
      return { consultation: result };
    } catch (error: any) {
      set.status = 500;
      return { error: 'Internal Server Error', message: error.message };
    }
  })
  .put('/consultations/:id/cancel', async ({ user, params, set }) => {
    try {
      const result = await cancelConsultation(user!.id, params.id);
      if (!result) {
        set.status = 404;
        return { error: 'Consultation not found' };
      }
      return { consultation: result };
    } catch (error: any) {
      set.status = 500;
      return { error: 'Internal Server Error', message: error.message };
    }
  })
  .get('/vet/:vetId/slots', async ({ user, params, query, set }) => {
    try {
      const result = await getVetSlots(user!.id, params.vetId, (query as any)?.date);
      return result;
    } catch (error: any) {
      set.status = 500;
      return { error: 'Internal Server Error', message: error.message };
    }
  });
