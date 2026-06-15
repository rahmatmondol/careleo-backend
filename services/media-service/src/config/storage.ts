export const STORAGE_DRIVER = (Bun.env.MEDIA_STORAGE_DRIVER || '').toLowerCase() || (
  Bun.env.AWS_S3_BUCKET && Bun.env.AWS_ACCESS_KEY_ID && Bun.env.AWS_SECRET_ACCESS_KEY ? 's3' : 'local'
);

export const MEDIA_LOCAL_UPLOAD_DIR = Bun.env.MEDIA_LOCAL_UPLOAD_DIR || '/app/uploads/media';
export const MEDIA_PUBLIC_BASE_URL = Bun.env.MEDIA_PUBLIC_BASE_URL || 'http://localhost:3017/uploads/media';

export const S3_REGION = Bun.env.AWS_REGION || Bun.env.AWS_DEFAULT_REGION || '';
export const S3_BUCKET = Bun.env.AWS_S3_BUCKET || '';
export const S3_ENDPOINT = Bun.env.AWS_S3_ENDPOINT || '';
export const S3_FORCE_PATH_STYLE = String(Bun.env.AWS_S3_FORCE_PATH_STYLE || 'false').toLowerCase() === 'true';
export const S3_PUBLIC_BASE_URL = Bun.env.AWS_S3_PUBLIC_BASE_URL || '';
