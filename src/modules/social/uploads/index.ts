import { Elysia } from 'elysia';
import { SocialUploadsService } from './service';
import { fwd } from '@/shared/http/service-result';
import { requireUser } from '@/shared/auth/domain-auth';

/**
 * `POST /api/v1/social/uploads/image` — multipart, field name `image` (or `file`).
 * `POST /api/v1/social/uploads/video` — multipart, field name `video` (or `file`).
 *
 * Return `{ imageUrl }` / `{ videoUrl }`, which the client then passes to
 * `POST /social/posts` or `POST /social/stories`. Two steps rather than one
 * multipart create, to match how the app already uploads pet photos and so a
 * user can attach media before deciding to publish.
 */
export const socialUploadsController = new Elysia({ name: 'social-uploads-controller' }).group(
  '/social',
  (app) =>
    app.guard({ beforeHandle: requireUser }, (g) =>
      g
        .post('/uploads/image', async ({ user, body, set }: any) => {
          const file = (body?.image || body?.file) as File;
          return fwd(await SocialUploadsService.uploadImage(user!.id, file), set);
        })
        .post('/uploads/video', async ({ user, body, set }: any) => {
          const file = (body?.video || body?.file) as File;
          return fwd(await SocialUploadsService.uploadVideo(user!.id, file), set);
        }),
    ),
);
