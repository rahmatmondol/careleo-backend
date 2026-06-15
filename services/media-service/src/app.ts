import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { hasPermission } from './constants/permissions';
import { mediaReadRoutes } from './routes/media.read.routes';
import { mediaManageRoutes } from './routes/media.manage.routes';
import { MEDIA_LOCAL_UPLOAD_DIR, STORAGE_DRIVER } from './config/storage';
import { join } from 'node:path';

function decodeJwtPayload(token: string): any {
  try {
    const payload = token.split('.')[1] || '';
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString());
  } catch {
    return null;
  }
}

function getUser(request: Request): { id: string; role?: string } | null {
  const internalKey = request.headers.get('x-internal-key');
  const expectedInternalKey = Bun.env.INTERNAL_SERVICE_KEY || 'pawly-internal';
  if (internalKey && internalKey === expectedInternalKey) {
    return { id: 'internal-service', role: 'SUPER_ADMIN' };
  }

  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const payload = decodeJwtPayload(auth.slice(7));
  const userId = payload?.sub ?? payload?.id;
  if (!userId) return null;
  return { id: String(userId), role: payload.role ? String(payload.role) : undefined };
}

export const app = new Elysia()
  .use(cors())
  .get('/health', () => ({ status: 'ok', service: 'media-service' }))
  .get('/api/v1/media/files/*', async ({ request, set }) => {
    if (STORAGE_DRIVER !== 'local') {
      set.status = 404;
      return { error: 'Not found' };
    }
    const path = new URL(request.url).pathname.replace('/api/v1/media/files/', '');
    const safe = path.split('/').filter((p) => p && p !== '.' && p !== '..').join('/');
    const file = Bun.file(join(MEDIA_LOCAL_UPLOAD_DIR, safe));
    if (!(await file.exists())) {
      set.status = 404;
      return { error: 'File not found' };
    }
    return new Response(file, { headers: { 'Content-Type': file.type || 'application/octet-stream' } });
  })
  .derive(({ request }) => ({ user: getUser(request) }))
  .guard({
    beforeHandle: ({ user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      const role = String(user.role || '').toUpperCase();
      if (!hasPermission(role, 'media.read')) {
        set.status = 403;
        return { error: 'Forbidden', message: 'Missing permission: media.read' };
      }
    },
  }, (group) =>
    group
      .use(mediaReadRoutes)
      .guard({
        beforeHandle: ({ user, set }) => {
          const role = String(user?.role || '').toUpperCase();
          if (!hasPermission(role, 'media.manage')) {
            set.status = 403;
            return { error: 'Forbidden', message: 'Missing permission: media.manage' };
          }
        },
      }, (secured) => secured.use(mediaManageRoutes))
  );
