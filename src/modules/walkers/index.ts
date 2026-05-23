import { Elysia } from 'elysia';
import { requireAuth } from '@/shared/auth/guards';
import { WalkersService } from './service';

export const walkersController = new Elysia({ name: 'walkers-controller' })
  .group('/walkers', (app) =>
    app
      /** List walkers. */
      .get('/', async ({ query }) => WalkersService.listWalkers((query ?? {}) as Record<string, unknown>))
      /** Nearby walkers alias endpoint. */
      .get('/nearby', async ({ query }) => WalkersService.listNearbyWalkers((query ?? {}) as Record<string, unknown>))
      /** Get walker by id. */
      .get('/:id', async ({ params }) => WalkersService.getWalker(String((params as any).id)))
      /** Placeholder reviews endpoint for contract parity. */
      .get('/:id/reviews', async ({ params }) => {
        await WalkersService.getWalker(String((params as any).id));
        return { reviews: [] };
      })
      /** Placeholder availability endpoint for contract parity. */
      .get('/:id/availability', async ({ params }) => {
        await WalkersService.getWalker(String((params as any).id));
        return { availability: [] };
      })
      /** Book a walker. */
      .post('/:id/book', async ({ headers, jwt, params, body }: any) => {
        const user = await requireAuth(headers, jwt);
        return WalkersService.book(user.id, 'walker', String(params.id), (body ?? {}) as Record<string, unknown>);
      }),
  )
  .group('/sitters', (app) =>
    app
      /** List sitters. */
      .get('/', async ({ query }) => WalkersService.listSitters((query ?? {}) as Record<string, unknown>))
      /** Nearby sitters alias endpoint. */
      .get('/nearby', async ({ query }) => WalkersService.listNearbySitters((query ?? {}) as Record<string, unknown>))
      /** Get sitter by id. */
      .get('/:id', async ({ params }) => WalkersService.getSitter(String((params as any).id)))
      /** Placeholder reviews endpoint for contract parity. */
      .get('/:id/reviews', async ({ params }) => {
        await WalkersService.getSitter(String((params as any).id));
        return { reviews: [] };
      })
      /** Book a sitter. */
      .post('/:id/book', async ({ headers, jwt, params, body }: any) => {
        const user = await requireAuth(headers, jwt);
        return WalkersService.book(user.id, 'sitter', String(params.id), (body ?? {}) as Record<string, unknown>);
      }),
  )
  .group('/bookings', (app) =>
    app
      /** List current user bookings. */
      .get('/', async ({ headers, jwt }: any) => {
        const user = await requireAuth(headers, jwt);
        return WalkersService.listBookings(user.id);
      })
      /** Get one booking for current user. */
      .get('/:id', async ({ headers, jwt, params }: any) => {
        const user = await requireAuth(headers, jwt);
        return WalkersService.getBooking(user.id, String(params.id));
      })
      /** Update current user booking. */
      .put('/:id', async ({ headers, jwt, params, body }: any) => {
        const user = await requireAuth(headers, jwt);
        return WalkersService.updateBooking(user.id, String(params.id), (body ?? {}) as Record<string, unknown>);
      })
      /** Delete current user booking. */
      .delete('/:id', async ({ headers, jwt, params }: any) => {
        const user = await requireAuth(headers, jwt);
        return WalkersService.deleteBooking(user.id, String(params.id));
      })
      /** Cancel booking. */
      .post('/:id/cancel', async ({ headers, jwt, params }: any) => {
        const user = await requireAuth(headers, jwt);
        return WalkersService.cancelBooking(user.id, String(params.id));
      })
      /** Complete booking. */
      .post('/:id/complete', async ({ headers, jwt, params }: any) => {
        const user = await requireAuth(headers, jwt);
        return WalkersService.completeBooking(user.id, String(params.id));
      })
      /** Review booking. */
      .post('/:id/review', async ({ headers, jwt, params, body }: any) => {
        const user = await requireAuth(headers, jwt);
        return WalkersService.reviewBooking(user.id, String(params.id), (body ?? {}) as Record<string, unknown>);
      })
      /** Placeholder photo update endpoint. */
      .post('/:id/photo-update', async ({ headers, jwt, params }: any) => {
        const user = await requireAuth(headers, jwt);
        await WalkersService.getBooking(user.id, String(params.id));
        return { message: 'Photo update accepted (placeholder)' };
      })
      /** Placeholder status update endpoint. */
      .post('/:id/status-update', async ({ headers, jwt, params, body }: any) => {
        const user = await requireAuth(headers, jwt);
        return WalkersService.updateBooking(user.id, String(params.id), { status: (body as any)?.status ?? 'in_progress' });
      }),
  );
