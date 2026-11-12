import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ReceiptGeneratorService } from './receipt-generator.service';
import { ReceiptProcessor } from './processors/receipt.processor';
import { StorageModule } from '../storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    StorageModule,
    NotificationsModule,
    BullModule.registerQueue(
      { name: 'receipts-queue' },
      { name: 'notifications-queue' },
    ),
  ],
  providers: [ReceiptGeneratorService, ReceiptProcessor],
  exports: [ReceiptGeneratorService],
})
export class ReceiptsModule {}

