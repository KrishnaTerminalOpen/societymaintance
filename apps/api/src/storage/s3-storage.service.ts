import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { IStorageService, UploadFileOptions, UploadResult } from './storage.interface';

@Injectable()
export class S3StorageService implements IStorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly publicUrlBase: string;

  constructor(private readonly configService: ConfigService) {
    this.bucketName =
      this.configService.get<string>('R2_BUCKET_NAME') ||
      this.configService.get<string>('AWS_S3_BUCKET_NAME') ||
      'colonydeposit-receipts';

    const endpoint =
      this.configService.get<string>('R2_ENDPOINT') ||
      this.configService.get<string>('AWS_S3_ENDPOINT');

    const accessKeyId =
      this.configService.get<string>('R2_ACCESS_KEY_ID') ||
      this.configService.get<string>('AWS_ACCESS_KEY_ID') ||
      'mock-access-key';

    const secretAccessKey =
      this.configService.get<string>('R2_SECRET_ACCESS_KEY') ||
      this.configService.get<string>('AWS_SECRET_ACCESS_KEY') ||
      'mock-secret-key';

    const region = this.configService.get<string>('AWS_REGION') || 'auto';

    this.publicUrlBase =
      this.configService.get<string>('R2_PUBLIC_URL') ||
      this.configService.get<string>('AWS_S3_PUBLIC_URL') ||
      `https://${this.bucketName}.r2.cloudflarestorage.com`;

    this.s3Client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true,
    });

    this.logger.log(`Initialized S3 / Cloudflare R2 Storage Client (Bucket: ${this.bucketName})`);
  }

  async upload(options: UploadFileOptions): Promise<UploadResult> {
    const folder = options.folder ? `${options.folder.replace(/\/+$/, '')}/` : '';
    const key = `${folder}${options.fileName}`;

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: options.buffer,
        ContentType: options.contentType,
      });

      await this.s3Client.send(command);

      const url = `${this.publicUrlBase.replace(/\/+$/, '')}/${key}`;
      this.logger.log(`Successfully uploaded file to Cloudflare R2 / S3: ${key} -> ${url}`);

      return {
        url,
        key,
        bucket: this.bucketName,
      };
    } catch (error) {
      this.logger.error(`Failed to upload file to Cloudflare R2 / S3: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getDownloadUrl(key: string): Promise<string> {
    return `${this.publicUrlBase.replace(/\/+$/, '')}/${key}`;
  }
}

