export interface UploadFileOptions {
  fileName: string;
  buffer: Buffer;
  contentType: string;
  folder?: string;
}

export interface UploadResult {
  url: string;
  key: string;
  bucket?: string;
}

export interface IStorageService {
  upload(options: UploadFileOptions): Promise<UploadResult>;
  getDownloadUrl(key: string): Promise<string>;
}

export const STORAGE_SERVICE = 'STORAGE_SERVICE';

