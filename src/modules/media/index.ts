import { Elysia } from 'elysia';
import { join } from 'node:path';
import { errorForStatus, NotFoundError } from '@/shared/errors';
import { domainAuth } from '@/shared/auth/domain-auth';
import { MEDIA_LOCAL_UPLOAD_DIR, STORAGE_DRIVER } from './config/storage';
import { requireMediaRead, requireMediaManage } from './guards';
import { mediaReadRoutes } from './media.read.routes';
import { mediaManageRoutes } from './media.manage.routes';

/**
 * Media library module — formerly the standalone media-service on port 3017.
 *
 * Route paths are unchanged: `/api/v1` comes from the app-wide prefix in
 * `app.ts` and `/media` from the group below, reproducing the URLs the gateway
 * used to proxy.
 *
 * See `guards.ts` for the one deliberate behaviour change — JWT signatures are
 * verified now, where the standalone service only decoded them.
 */

/** Same failure-return convention as the shop module; see `modules/shop/index.ts`. */
const normaliseErrorReturns = (app: Elysia) =>
  app.onAfterHandle(({ response, set }) => {
    if (response instanceof Response) return response;
    if (!response || typeof response !== 'object') return response;

    const body = response as { error?: unknown; status?: unknown; message?: unknown };
    if (typeof body.error !== 'string') return response;

    const status =
      typeof body.status === 'number'
        ? body.status
        : typeof set.status === 'number'
          ? set.status
          : 400;
    const message = typeof body.message === 'string' ? body.message : body.error;
    throw errorForStatus(status, message);
  });

/**
 * Serve locally-stored uploads.
 *
 * Deliberately mounted *outside* the permission guards below, matching
 * media-service: this is the public URL that ends up in `media_assets.url` and
 * is embedded in product pages and posts, so it cannot require a bearer token.
 */
const localFileRoutes = new Elysia({ name: 'media-file-routes' }).get(
  '/media/files/*',
  async ({ request }) => {
    if (STORAGE_DRIVER !== 'local') throw new NotFoundError('Not found');

    const path = new URL(request.url).pathname.replace('/api/v1/media/files/', '');
    // Reject traversal segments before touching the filesystem.
    const safe = path
      .split('/')
      .filter((p) => p && p !== '.' && p !== '..')
      .join('/');

    const file = Bun.file(join(MEDIA_LOCAL_UPLOAD_DIR, safe));
    if (!(await file.exists())) throw new NotFoundError('File not found');

    return new Response(file, {
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    });
  },
);

export const mediaController = new Elysia({ name: 'media-controller' })
  .use(domainAuth)
  .use(normaliseErrorReturns)
  .use(localFileRoutes)
  .group('/media', (app) =>
    app.guard({ beforeHandle: requireMediaRead }, (read) =>
      read
        .use(mediaReadRoutes)
        .guard({ beforeHandle: requireMediaManage }, (manage) => manage.use(mediaManageRoutes)),
    ),
  );
