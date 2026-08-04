import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Elysia } from 'elysia';
import { requireAuth } from '@/shared/auth/guards';
import { UserService } from './service';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
};

export const userController = new Elysia({ name: 'user-controller' }).group('/users', (app) =>
  app
    /** Get current authenticated user profile. */
    .get('/me', async (ctx: any) => {
      const { headers, jwt } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return UserService.getMe(authUser.id);
    })
    /** Update current authenticated user profile. */
    .put('/me', async (ctx: any) => {
      const { headers, jwt, body } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return UserService.updateMe(authUser.id, body as Record<string, unknown>);
    })
    /** Upload current authenticated user's profile image. */
    .post('/me/image', async (ctx: any) => {
      const { headers, jwt, body } = ctx;
      const authUser = await requireAuth(headers, jwt);
      const file = ((body as any)?.image || (body as any)?.file) as File;
      return UserService.uploadProfileImage(authUser.id, file);
    })
);

/**
 * Serves everything written under `uploads/` — profile and pet photos, and now
 * social post videos.
 *
 * Videos need more than a bare stream. Both AVPlayer (iOS) and ExoPlayer
 * (Android) probe with a ranged request before they will play a remote file, and
 * seeking is nothing but `Range`; without `Accept-Ranges` and a 206 the player
 * either refuses the source or can only play it straight through. The
 * `Content-Type` matters for the same reason — an unlabelled body was fine for
 * `<Image>` but is not something a player will commit to decoding.
 */
export const uploadsController = new Elysia({ name: 'uploads-controller' }).group('/uploads', (app) =>
  app.get('/*', async ({ params, headers, set }) => {
    const relative = String((params as any)['*'] || '').replace(/^\/+/, '');
    const absolute = path.resolve(path.join(UPLOAD_ROOT, relative));

    if (!absolute.startsWith(path.resolve(UPLOAD_ROOT) + path.sep)) {
      set.status = 400;
      return { message: 'Invalid file path' };
    }

    let size: number;
    try {
      const info = await stat(absolute);
      if (!info.isFile()) throw new Error('not a file');
      size = info.size;
    } catch {
      set.status = 404;
      return { message: 'File not found' };
    }

    const contentType = CONTENT_TYPES[path.extname(absolute).toLowerCase()] || 'application/octet-stream';
    const range = /^bytes=(\d*)-(\d*)$/.exec(String((headers as any)?.range || '').trim());

    if (range) {
      const [, rawStart, rawEnd] = range;
      // `bytes=-500` means the *last* 500 bytes, not "from 0 to 500".
      const start = rawStart ? Number(rawStart) : Math.max(0, size - Number(rawEnd || 0));
      const end = rawStart ? Math.min(Number(rawEnd || size - 1), size - 1) : size - 1;

      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' },
        });
      }

      return new Response(createReadStream(absolute, { start, end }) as any, {
        status: 206,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes',
        },
      });
    }

    return new Response(createReadStream(absolute) as any, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
      },
    });
  })
);
