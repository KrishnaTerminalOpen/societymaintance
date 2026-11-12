import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { STORAGE_SERVICE } from './storage.interface';
import { S3StorageService } from './s3-storage.service';
import { LocalStorageService } from './local-storage.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    S3StorageService,
    LocalStorageService,
    {
      provide: STORAGE_SERVICE,
      useFactory: (configService: ConfigService, s3Service: S3StorageService, localService: LocalStorageService) => {
        const hasR2 = !!configService.get('R2_ACCESS_KEY_ID') && configService.get('R2_ACCESS_KEY_ID') !== 'mock-access-key';
        const hasS3 = !!configService.get('AWS_ACCESS_KEY_ID') && configService.get('AWS_ACCESS_KEY_ID') !== 'mock-access-key';
        const forceLocal = configService.get('STORAGE_DRIVER') === 'local';

        if (forceLocal || (!hasR2 && !hasS3)) {
          return localService;
        }
        return s3Service;
      },
      inject: [ConfigService, S3StorageService, LocalStorageService],
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}

