import { randomUUID } from 'node:crypto';
import { Elysia } from 'elysia';

export const attachCorrelationId = new Elysia({ name: 'correlation-id' }).derive(({ request, set }) => {
  const incoming = request.headers.get('x-correlation-id');
  const correlationId = incoming?.trim() || randomUUID();
  set.headers['x-correlation-id'] = correlationId;
  return { correlationId };
});
