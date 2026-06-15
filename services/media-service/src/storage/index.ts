import { STORAGE_DRIVER } from '../config/storage';
import { LocalMediaStorage } from './local';
import { S3MediaStorage } from './s3';
import type { MediaStorage } from './types';

export const mediaStorage: MediaStorage = STORAGE_DRIVER === 's3'
  ? new S3MediaStorage()
  : new LocalMediaStorage();
