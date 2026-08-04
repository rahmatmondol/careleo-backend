import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  S3_BUCKET,
  S3_ENDPOINT,
  S3_FORCE_PATH_STYLE,
  S3_PUBLIC_BASE_URL,
  S3_REGION,
} from '../config/storage';
import { extensionFromMime, sanitizeFileName } from '../utils/file';
import type { MediaStorage, StorageUploadInput, StorageUploadResult } from './types';

let s3Client: S3Client | null = null;
const getS3Client = () => {
  if (!s3Client) {
    s3Client = new S3Client({
      region: S3_REGION,
      endpoint: S3_ENDPOINT || undefined,
      forcePathStyle: S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: Bun.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: Bun.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });
  }
  return s3Client;
};

export class S3MediaStorage implements MediaStorage {
  async upload(input: StorageUploadInput): Promise<StorageUploadResult> {
    if (!S3_BUCKET || !S3_REGION) {
      throw new Error('S3 is not configured: missing AWS_S3_BUCKET or AWS_REGION');
    }

    const folder = input.folder ? input.folder.replace(/^\/+|\/+$/g, '') : 'misc';
    const safeOriginal = sanitizeFileName(input.originalName || 'file');
    const ext = safeOriginal.includes('.') ? safeOriginal.split('.').pop() : extensionFromMime(input.mimeType);
    const fileName = `${Date.now()}-${randomUUID()}.${ext}`;
    const storageKey = `${folder}/${fileName}`;

    await getS3Client().send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: storageKey,
      Body: input.bytes,
      ContentType: input.mimeType,
    }));

    const url = S3_PUBLIC_BASE_URL
      ? `${S3_PUBLIC_BASE_URL.replace(/\/$/, '')}/${storageKey}`
      : `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${storageKey}`;

    return { url, storageKey, fileName };
  }

  async delete(storageKey: string): Promise<void> {
    if (!S3_BUCKET || !storageKey) return;
    await getS3Client().send(new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: storageKey,
    }));
  }
}
