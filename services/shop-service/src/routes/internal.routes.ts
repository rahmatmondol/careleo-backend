import { Elysia } from 'elysia';
import { createOrderForUser } from '../services/customer/cart.service';

/**
 * Internal, service-to-service routes — NOT exposed through the public gateway.
 * Authenticated by a shared secret (INTERNAL_SERVICE_SECRET) rather than a user
 * JWT, so careleo-backend background jobs can place orders on a user's behalf
 * (e.g. Premium auto re-order when the user is offline).
 */
const INTERNAL_SECRET = Bun.env.INTERNAL_SERVICE_SECRET || '';

export const internalRoutes = new Elysia().post(
  '/api/v1/shop/internal/orders',
  async ({ request, body, set }) => {
    const secret = request.headers.get('x-internal-secret') ?? '';
    if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
      set.status = 401;
      return { error: 'Unauthorized' };
    }
    const b = (body ?? {}) as { userId?: string; items?: { productId: string; quantity: number }[] };
    if (!b.userId || !Array.isArray(b.items) || b.items.length === 0) {
      set.status = 400;
      return { error: 'userId and items[] are required' };
    }
    const result = await createOrderForUser(b.userId, b.items);
    if ((result as any).error) {
      set.status = 400;
      return result;
    }
    return result;
  },
);
