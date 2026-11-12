import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { prisma } from '@colony/database';
import { ReceiptGeneratorService } from '../receipt-generator.service';
import { STORAGE_SERVICE, IStorageService } from '../../storage/storage.interface';
import { DeadLetterQueueService } from '../../notifications/dlq.service';

export interface GenerateReceiptJobData {
  paymentId: string;
}

@Processor('receipts-queue')
@Injectable()
export class ReceiptProcessor extends WorkerHost {
  private readonly logger = new Logger(ReceiptProcessor.name);

  constructor(
    private readonly receiptGenerator: ReceiptGeneratorService,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
    @InjectQueue('notifications-queue') private readonly notificationsQueue: Queue,
    private readonly dlqService: DeadLetterQueueService,
  ) {
    super();
  }

  async process(job: Job<GenerateReceiptJobData>): Promise<any> {
    const { paymentId } = job.data;
    this.logger.log(`[ReceiptWorker] Processing receipt generation for payment: ${paymentId} (Attempt ${job.attemptsMade + 1})`);

    try {
      // 1. Fetch payment details
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
          user: true,
          deposit: {
            include: {
              house: true,
            },
          },
          receipt: true,
        },
      });

      if (!payment) {
        throw new Error(`Payment ${paymentId} not found`);
      }

      // 2. Fetch colony settings for branding
      const setting = await prisma.setting.findFirst();
      const colonyName = setting?.colonyName || 'Gokuldham Co-operative Housing Society';

      // 3. Generate sequential receipt number if not exists
      const receiptCount = await prisma.receipt.count();
      const receiptNumber =
        payment.receipt?.receiptNumber ||
        `REC-${new Date().getFullYear()}${(new Date().getMonth() + 1).toString().padStart(2, '0')}-${(10001 + receiptCount).toString()}`;

      // 4. Generate Branded PDF Buffer
      const pdfBuffer = await this.receiptGenerator.generateReceiptPdf({
        colonyName,
        colonyAddress: 'Resident Welfare Association & Housing Society',
        receiptNumber,
        paymentDate: payment.createdAt,
        residentName: payment.user.name,
        residentPhone: payment.user.phone,
        residentEmail: payment.user.email,
        houseBlock: payment.deposit.house.block,
        houseNumber: payment.deposit.house.houseNumber,
        houseType: payment.deposit.house.type,
        amountPaise: payment.amount,
        paymentMethod: payment.method,
        gatewayOrderId: payment.gatewayOrderId,
        gatewayPaymentId: payment.gatewayPaymentId,
        status: payment.status,
        isOffline: payment.isOffline,
        offlineNotes: payment.offlineNotes,
        verifiedBy: payment.offlineVerifiedBy,
      });

      // 5. Upload to Cloudflare R2 / S3
      const uploadResult = await this.storageService.upload({
        fileName: `${receiptNumber}.pdf`,
        buffer: pdfBuffer,
        contentType: 'application/pdf',
        folder: 'receipts',
      });

      // 6. Upsert Receipt Record
      const receipt = await prisma.receipt.upsert({
        where: { paymentId: payment.id },
        create: {
          paymentId: payment.id,
          receiptNumber,
          pdfUrl: uploadResult.url,
        },
        update: {
          receiptNumber,
          pdfUrl: uploadResult.url,
        },
      });

      this.logger.log(`[ReceiptWorker] Receipt ${receiptNumber} generated and stored at ${uploadResult.url}`);

      // 7. Enqueue Payment Success Notification to Resident with Receipt Link
      await this.notificationsQueue.add(
        'dispatch-notification',
        {
          userId: payment.userId,
          type: 'PAYMENT_SUCCESS',
          channel: 'ALL',
          metadata: {
            colonyName,
            receiptNumber,
            pdfUrl: uploadResult.url,
            amountPaise: Number(payment.amount),
            unit: `Block ${payment.deposit.house.block}-${payment.deposit.house.houseNumber}`,
          },
        },
        {
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );

      return {
        success: true,
        receiptId: receipt.id,
        receiptNumber,
        pdfUrl: uploadResult.url,
      };
    } catch (error: any) {
      this.logger.error(`[ReceiptWorker] Failed generating receipt for payment ${paymentId}: ${error.message}`);

      // If attempts exhausted, capture in DLQ
      if (job.attemptsMade >= 4) {
        await this.dlqService.recordFailedJob(job, error);
      }
      throw error;
    }
  }
}

