import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ValidationError } from '@/shared/errors';

/**
 * Image upload for social posts and stories.
 *
 * Why this exists rather than reusing the media library: `/media/upload`
 * requires the `media.manage` permission, which only admin-ish roles hold (see
 * `modules/media/constants/permissions.ts`). A `customer` — every ordinary app
 * user — cannot call it, so without this endpoint nobody could attach a photo
 * to a post at all. Opening media up to customers would have widened access to
 * the whole shared asset library, including delete.
 *
 * The shape deliberately mirrors `PetsService.uploadPetImage`: same size and
 * type limits, same sharp re-encode to JPEG, same `/api/v1/uploads/...` URL
 * served by `uploadsController`. Files land under `uploads/social/<userId>/`,
 * so a user can only ever write inside their own folder.
 */

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50MB
/** Extension per accepted container — we never trust the client's filename. */
const ALLOWED_VIDEO_TYPES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

/**
 * Re-encode to JPEG at a sane size.
 *
 * This is not only about bandwidth: decoding and re-encoding through sharp
 * discards whatever the original container held — EXIF (including GPS
 * coordinates from a phone camera) and any non-image payload smuggled into the
 * file. Posts are public, so stripping location data matters.
 */
const compressToJpeg = async (bytes: Buffer) =>
  sharp(bytes).rotate().resize({ width: 1440, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();

export const SocialUploadsService = {
  async uploadImage(userId: string, file: File) {
    if (!file) return { status: 400, error: 'image is required' };
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return { status: 400, error: 'Invalid file type. Use JPG, PNG, or WebP' };
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return { status: 400, error: 'File too large. Max 10MB' };
    }

    try {
      const originalBytes = Buffer.from(await file.arrayBuffer());
      const bytes = await compressToJpeg(originalBytes);

      const base = sanitizeFileName((file.name || 'post').replace(/\.[^.]+$/, '')) || 'post';
      const dir = path.join(UPLOAD_ROOT, 'social', userId);
      await mkdir(dir, { recursive: true });

      const filename = `${Date.now()}-${base}.jpg`;
      await writeFile(path.join(dir, filename), bytes);

      const imageUrl = `/api/v1/uploads/social/${userId}/${filename}`;
      return { data: { imageUrl, message: 'Image uploaded' }, status: 201 };
    } catch (err) {
      // A corrupt or non-image file makes sharp throw; that is a bad request,
      // not a server fault.
      if (err instanceof ValidationError) return { status: 400, error: err.message };
      console.warn('[social] image upload failed:', err);
      return { status: 400, error: 'Could not process that image' };
    }
  },

  /**
   * Video upload for social posts.
   *
   * Deliberately dumber than `uploadImage`: the bytes are written through
   * untouched. There is no sharp equivalent here — re-encoding video would mean
   * ffmpeg and a job queue, which is not worth it before we know people post
   * videos at all. The consequences are handled instead of ignored:
   *
   *  - The extension comes from the MIME allow-list, never from `file.name`, so
   *    a `.mp4` claim cannot land an executable in a served directory.
   *  - The cap is 50MB rather than the images' 10MB, still small enough that a
   *    phone upload finishes on a normal connection.
   *
   * Unlike images, container metadata (including GPS on some phone recordings)
   * survives. Worth stripping if video posts get real traction.
   */
  async uploadVideo(userId: string, file: File) {
    if (!file) return { status: 400, error: 'video is required' };

    const ext = ALLOWED_VIDEO_TYPES[file.type];
    if (!ext) return { status: 400, error: 'Invalid file type. Use MP4, MOV, or WebM' };
    if (file.size > MAX_VIDEO_BYTES) return { status: 400, error: 'File too large. Max 50MB' };

    try {
      const bytes = Buffer.from(await file.arrayBuffer());

      const base = sanitizeFileName((file.name || 'post').replace(/\.[^.]+$/, '')) || 'post';
      const dir = path.join(UPLOAD_ROOT, 'social', userId);
      await mkdir(dir, { recursive: true });

      const filename = `${Date.now()}-${base}.${ext}`;
      await writeFile(path.join(dir, filename), bytes);

      const videoUrl = `/api/v1/uploads/social/${userId}/${filename}`;
      return { data: { videoUrl, message: 'Video uploaded' }, status: 201 };
    } catch (err) {
      console.warn('[social] video upload failed:', err);
      return { status: 400, error: 'Could not process that video' };
    }
  },
};
