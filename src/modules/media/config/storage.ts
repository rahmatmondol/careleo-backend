/**
 * Media storage configuration.
 *
 * Two defaults changed when media-service was merged in, because they described
 * that container rather than this process:
 *
 * - `MEDIA_LOCAL_UPLOAD_DIR` was `/app/uploads/media`, the absolute path inside
 *   the media-service image. It is a path relative to the backend's working
 *   directory now, so a plain `bun run dev` writes somewhere that exists.
 * - `MEDIA_PUBLIC_BASE_URL` was `http://localhost:3017/uploads/media`, pointing
 *   at the retired service *and* at a path it never actually served — uploads
 *   were read back through `/api/v1/media/files/*`. The default matches the
 *   route that serves them now.
 *
 * Both remain environment-overridable; point `MEDIA_PUBLIC_BASE_URL` at your CDN
 * or public origin in production. Existing `media_assets.url` values are stored
 * absolute and are not rewritten by this change — see
 * `docs/microservices/merge-into-monolith.md`.
 */

export const STORAGE_DRIVER =
  (Bun.env.MEDIA_STORAGE_DRIVER || '').toLowerCase() ||
  (Bun.env.AWS_S3_BUCKET && Bun.env.AWS_ACCESS_KEY_ID && Bun.env.AWS_SECRET_ACCESS_KEY ? 's3' : 'local');

export const MEDIA_LOCAL_UPLOAD_DIR = Bun.env.MEDIA_LOCAL_UPLOAD_DIR || './uploads/media';
export const MEDIA_PUBLIC_BASE_URL =
  Bun.env.MEDIA_PUBLIC_BASE_URL || 'http://localhost:3000/api/v1/media/files';

export const S3_REGION = Bun.env.AWS_REGION || Bun.env.AWS_DEFAULT_REGION || '';
export const S3_BUCKET = Bun.env.AWS_S3_BUCKET || '';
export const S3_ENDPOINT = Bun.env.AWS_S3_ENDPOINT || '';
export const S3_FORCE_PATH_STYLE =
  String(Bun.env.AWS_S3_FORCE_PATH_STYLE || 'false').toLowerCase() === 'true';
export const S3_PUBLIC_BASE_URL = Bun.env.AWS_S3_PUBLIC_BASE_URL || '';
