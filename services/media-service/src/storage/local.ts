import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MEDIA_LOCAL_UPLOAD_DIR, MEDIA_PUBLIC_BASE_URL } from '../config/storage';
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

    const base = MEDIA_PUBLIC_BASE_URL.replace(/\/$/, '');
    return { url: `${base}/${storageKey}`, storageKey, fileName };
  }

  async delete(storageKey: string): Promise<void> {
    const safe = storageKey.split('/').filter((p) => p && p !== '.' && p !== '..').join('/');
    if (!safe) return;
    const fullPath = join(MEDIA_LOCAL_UPLOAD_DIR, safe);
    await rm(fullPath, { force: true });
  }
}
