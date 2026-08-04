import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MEDIA_LOCAL_UPLOAD_DIR } from '../config/storage';
import { extensionFromMime, sanitizeFileName } from '../utils/file';
import type { MediaStorage, StorageUploadInput, StorageUploadResult } from './types';

export class LocalMediaStorage implements MediaStorage {
  async upload(input: StorageUploadInput): Promise<StorageUploadResult> {
    const folder = input.folder ? input.folder.replace(/^\/+|\/+$/g, '') : 'misc';
    const safeOriginal = sanitizeFileName(input.originalName || 'file');
    const ext = safeOriginal.includes('.') ? safeOriginal.split('.').pop() : extensionFromMime(input.mimeType);
    const fileName = `${Date.now()}-${randomUUID()}.${ext}`;
    const storageKey = `${folder}/${fileName}`;

    const dir = join(MEDIA_LOCAL_UPLOAD_DIR, folder);
    await mkdir(dir, { recursive: true });
    const fullPath = join(MEDIA_LOCAL_UPLOAD_DIR, storageKey);
    await Bun.write(fullPath, input.bytes);

    /**
     * Store a *relative* URL, not an absolute one.
     *
     * This used to bake `MEDIA_PUBLIC_BASE_URL` into the stored value, so a
     * file uploaded while that pointed at `http://localhost:3000` was written
     * to the database as `http://localhost:3000/api/v1/media/files/...`. That
     * URL is correct on exactly one machine: on a phone or emulator
     * `localhost` is the *device*, so every catalogue image failed to load.
     * The same trap had already bitten once with the retired :8090 gateway.
     *
     * A relative path has no such dependency. `normaliseMediaUrl` turns it
     * absolute on read using the origin configured *at that moment*, so the
     * same row renders correctly from a laptop, a phone on the LAN and
     * production without anything being rewritten.
     */
    return { url: `/api/v1/media/files/${storageKey}`, storageKey, fileName };
  }

  async delete(storageKey: string): Promise<void> {
    const safe = storageKey.split('/').filter((p) => p && p !== '.' && p !== '..').join('/');
    if (!safe) return;
    const fullPath = join(MEDIA_LOCAL_UPLOAD_DIR, safe);
    await rm(fullPath, { force: true });
  }
}
