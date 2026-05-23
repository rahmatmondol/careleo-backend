import { createReadStream } from 'node:fs';
import path from 'node:path';
import { Elysia } from 'elysia';
import { requireAuth } from '@/shared/auth/guards';
import { UserService } from './service';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');

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

export const uploadsController = new Elysia({ name: 'uploads-controller' }).group('/uploads', (app) =>
  app.get('/*', async ({ params, set }) => {
    const relative = String((params as any)['*'] || '').replace(/^\/+/, '');
    const absolute = path.resolve(path.join(UPLOAD_ROOT, relative));

    if (!absolute.startsWith(path.resolve(UPLOAD_ROOT))) {
      set.status = 400;
      return { message: 'Invalid file path' };
    }

    try {
      return new Response(createReadStream(absolute) as any);
    } catch {
      set.status = 404;
      return { message: 'File not found' };
    }
  })
);
