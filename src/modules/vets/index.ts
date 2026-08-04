import { Elysia } from 'elysia';
import { requireAuth } from '@/shared/auth/guards';
import { VetsService } from './service';

export const vetsController = new Elysia({ name: 'vets-controller' }).group('/vets', (app) =>
  app
    /** Vets directory list with optional filters. */
    .get('/', async ({ query }) => VetsService.listVets((query ?? {}) as Record<string, unknown>))
    /** Alias search endpoint for mobile contract. */
    .get('/search', async ({ query }) => VetsService.listVets((query ?? {}) as Record<string, unknown>))
    /** Get single vet profile. */
    .get('/:id', async ({ params }) => VetsService.getVet(String((params as any).id)))
    /** Get reviews for one vet. */
    .get('/:id/reviews', async ({ params }) => VetsService.getVetReviews(String((params as any).id)))
    /** Get services for one vet. */
    .get('/:id/services', async ({ params }) => VetsService.getVetServices(String((params as any).id)))
    /** Get availability slots for one vet. */
    .get('/:id/availability', async ({ params }) => VetsService.getVetAvailability(String((params as any).id)))
    /** Bookable 30-min slots for one vet on a date (`?date=YYYY-MM-DD&mode=video`). */
    .get('/:id/slots', async ({ params, query }: any) =>
      VetsService.getVetSlots(String(params.id), query?.date, query?.mode === 'video' || query?.mode === 'visit' ? query.mode : undefined))
    /** Book video appointment with a vet. */
    .post('/:id/book-video', async ({ headers, jwt, params, body }: any) => {
      const user = await requireAuth(headers, jwt);
      return VetsService.bookAppointment(user.id, String(params.id), 'video', (body ?? {}) as Record<string, unknown>);
    })
    /** Book physical visit appointment with a vet. */
    .post('/:id/book-visit', async ({ headers, jwt, params, body }: any) => {
      const user = await requireAuth(headers, jwt);
      return VetsService.bookAppointment(user.id, String(params.id), 'visit', (body ?? {}) as Record<string, unknown>);
    })
    /** List current user vet appointments. */
    .get('/appointments', async ({ headers, jwt }: any) => {
      const user = await requireAuth(headers, jwt);
      return VetsService.listAppointments(user.id);
    })
    /** Get one current user appointment by id. */
    .get('/appointments/:id', async ({ headers, jwt, params }: any) => {
      const user = await requireAuth(headers, jwt);
      return VetsService.getAppointment(user.id, String(params.id));
    })
    /** Update one current user appointment. */
    .put('/appointments/:id', async ({ headers, jwt, params, body }: any) => {
      const user = await requireAuth(headers, jwt);
      return VetsService.updateAppointment(user.id, String(params.id), (body ?? {}) as Record<string, unknown>);
    })
    /** Delete one current user appointment. */
    .delete('/appointments/:id', async ({ headers, jwt, params }: any) => {
      const user = await requireAuth(headers, jwt);
      return VetsService.deleteAppointment(user.id, String(params.id));
    })
    /** Reschedule appointment to another date/time. */
    .post('/appointments/:id/reschedule', async ({ headers, jwt, params, body }: any) => {
      const user = await requireAuth(headers, jwt);
      return VetsService.rescheduleAppointment(user.id, String(params.id), (body ?? {}) as Record<string, unknown>);
    })
    /** Cancel appointment. */
    .post('/appointments/:id/cancel', async ({ headers, jwt, params }: any) => {
      const user = await requireAuth(headers, jwt);
      return VetsService.cancelAppointment(user.id, String(params.id));
    })
    /** Start appointment call. */
    .post('/appointments/:id/start-call', async ({ headers, jwt, params }: any) => {
      const user = await requireAuth(headers, jwt);
      return VetsService.startCall(user.id, String(params.id));
    })
    /** Get appointment call token. */
    .get('/appointments/:id/call-token', async ({ headers, jwt, params }: any) => {
      const user = await requireAuth(headers, jwt);
      return VetsService.getCallToken(user.id, String(params.id));
    })
    /** List current user prescriptions. */
    .get('/prescriptions', async ({ headers, jwt }: any) => {
      const user = await requireAuth(headers, jwt);
      return VetsService.listPrescriptions(user.id);
    })
    /** Get one prescription by id. */
    .get('/prescriptions/:id', async ({ headers, jwt, params }: any) => {
      const user = await requireAuth(headers, jwt);
      return VetsService.getPrescription(user.id, String(params.id));
    })
    /** Request prescription refill. */
    .post('/prescriptions/:id/refill', async ({ headers, jwt, params }: any) => {
      const user = await requireAuth(headers, jwt);
      return VetsService.refillPrescription(user.id, String(params.id));
    })
    /** Create review for vet. */
    .post('/:id/reviews', async ({ headers, jwt, params, body }: any) => {
      const user = await requireAuth(headers, jwt);
      return VetsService.createReview(user.id, String(params.id), (body ?? {}) as Record<string, unknown>);
    })
    /** Update current user's review. */
    .put('/reviews/:reviewId', async ({ headers, jwt, params, body }: any) => {
      const user = await requireAuth(headers, jwt);
      return VetsService.updateReview(user.id, String(params.reviewId), (body ?? {}) as Record<string, unknown>);
    })
    /** Delete current user's review. */
    .delete('/reviews/:reviewId', async ({ headers, jwt, params }: any) => {
      const user = await requireAuth(headers, jwt);
      return VetsService.deleteReview(user.id, String(params.reviewId));
    }),
);
