import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { IStorageService, UploadFileOptions, UploadResult } from './storage.interface';

@Injectable()
export class LocalStorageService implements IStorageService {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly uploadDir: string;

  constructor() {
    this.uploadDir = path.resolve(process.cwd(), 'uploads', 'receipts');
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
    this.logger.log(`Initialized Local Storage Provider (Path: ${this.uploadDir})`);
  }

  async upload(options: UploadFileOptions): Promise<UploadResult> {
    const filePath = path.join(this.uploadDir, options.fileName);
    await fs.promises.writeFile(filePath, options.buffer);

    // Return a local URL accessible via web or CDN proxy
    const url = `/uploads/receipts/${options.fileName}`;
    this.logger.log(`Saved file locally: ${filePath} (accessible as ${url})`);

    return {
      url,
      key: options.fileName,
      bucket: 'local-storage',
    };
  }

  async getDownloadUrl(key: string): Promise<string> {
    return `/uploads/receipts/${key}`;
  }
}

