export type StorageUploadInput = {
  bytes: Uint8Array;
  mimeType: string;
  originalName: string;
  folder?: string;
};

export type StorageUploadResult = {
  url: string;
  storageKey: string;
  fileName: string;
};

export interface MediaStorage {
  upload(input: StorageUploadInput): Promise<StorageUploadResult>;
  delete(storageKey: string): Promise<void>;
}
