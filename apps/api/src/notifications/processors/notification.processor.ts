import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { NotificationsService, DispatchNotificationDto } from '../notifications.service';
import { DeadLetterQueueService } from '../dlq.service';

@Processor('notifications-queue')
@Injectable()
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly dlqService: DeadLetterQueueService,
  ) {
    super();
  }

  async process(job: Job<DispatchNotificationDto>): Promise<any> {
    const data = job.data;
    this.logger.log(
      `[NotificationWorker] Processing notification (${data.type}) for user ${data.userId} (Attempt ${job.attemptsMade + 1})`,
    );

    try {
      const result = await this.notificationsService.dispatch(data);

      if (!result.success) {
        throw new Error(`Notification dispatch failed across configured channels for user ${data.userId}`);
      }

      this.logger.log(`[NotificationWorker] Notification ${data.type} successfully dispatched to user ${data.userId}`);
      return result;
    } catch (error: any) {
      this.logger.error(
        `[NotificationWorker] Failed dispatching notification (${data.type}) to user ${data.userId}: ${error.message}`,
      );

      // If attempts exhausted (e.g. 5 attempts), capture in Dead Letter Queue (DLQ)
      if (job.attemptsMade >= 4) {
        await this.dlqService.recordFailedJob(job, error);
      }

      throw error;
    }
  }
}

