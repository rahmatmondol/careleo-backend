import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';
import { fail } from '../../packages/shared-http/src/index';
import { AuthService } from './service';

export const authController = new Elysia({ name: 'auth-controller' })
  /** Service health route. */
  .get('/health', () => AuthService.health())
  /** Auth proxy routes (service local path style). */
  .all('/auth', async ({ request, path, set }) => {
    try {
      return await AuthService.forwardAuthRequest(request, path);
    } catch (error: any) {
      set.status = 502;
      return fail('AUTH_UPSTREAM_UNAVAILABLE', 'Auth upstream is unavailable', error?.message ?? 'unknown error');
    }
  })
  .all('/auth/*', async ({ request, path, set }) => {
    try {
      return await AuthService.forwardAuthRequest(request, path);
    } catch (error: any) {
      set.status = 502;
      return fail('AUTH_UPSTREAM_UNAVAILABLE', 'Auth upstream is unavailable', error?.message ?? 'unknown error');
    }
  })
  /** Auth proxy routes (gateway pass-through style). */
  .all('/api/v1/auth', async ({ request, path, set }) => {
    try {
      return await AuthService.forwardAuthRequest(request, path);
    } catch (error: any) {
      set.status = 502;
      return fail('AUTH_UPSTREAM_UNAVAILABLE', 'Auth upstream is unavailable', error?.message ?? 'unknown error');
    }
  })
  .all('/api/v1/auth/*', async ({ request, path, set }) => {
    try {
      return await AuthService.forwardAuthRequest(request, path);
    } catch (error: any) {
      set.status = 502;
      return fail('AUTH_UPSTREAM_UNAVAILABLE', 'Auth upstream is unavailable', error?.message ?? 'unknown error');
    }
  });

const port = Number(process.env.AUTH_SERVICE_PORT ?? '3001');

new Elysia().use(cors()).use(authController).listen(port);

console.log(`Auth service running at http://localhost:${port}`);
