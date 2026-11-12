import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';

export interface FailedJobRecord {
  id: string;
  originalJobId?: string;
  queueName: string;
  jobName: string;
  data: any;
  failedReason: string;
  stackTrace?: string;
  attemptsMade: number;
  failedAt: Date;
}

@Injectable()
export class DeadLetterQueueService {
  private readonly logger = new Logger(DeadLetterQueueService.name);
  // Store failed DLQ records (persisted across in-memory / cache store)
  private readonly failedRecords = new Map<string, FailedJobRecord>();

  constructor(
    @InjectQueue('receipts-queue') private readonly receiptsQueue: Queue,
    @InjectQueue('notifications-queue') private readonly notificationsQueue: Queue,
    @InjectQueue('reminders-queue') private readonly remindersQueue: Queue,
  ) {}

  /**
   * Records a job that exhausted all retries into the DLQ registry.
   */
  async recordFailedJob(job: any, error: Error | any): Promise<FailedJobRecord> {
    const id = `dlq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const record: FailedJobRecord = {
      id,
      originalJobId: job.id?.toString(),
      queueName: job.queueName || 'unknown-queue',
      jobName: job.name || 'unknown-job',
      data: job.data || {},
      failedReason: error.message || String(error),
      stackTrace: error.stack,
      attemptsMade: job.attemptsMade || 5,
      failedAt: new Date(),
    };

    this.failedRecords.set(id, record);
    this.logger.error(
      `🚨 [DLQ RECORDED] Queue: ${record.queueName} | Job: ${record.jobName} | Reason: ${record.failedReason}`,
    );

    return record;
  }

  /**
   * Returns list of failed jobs for the admin panel.
   */
  async getFailedJobs(): Promise<FailedJobRecord[]> {
    return Array.from(this.failedRecords.values()).sort(
      (a, b) => b.failedAt.getTime() - a.failedAt.getTime(),
    );
  }

  /**
   * Re-enqueues a failed job into its original BullMQ queue.
   */
  async retryFailedJob(id: string): Promise<{ success: boolean; message: string }> {
    const record = this.failedRecords.get(id);
    if (!record) {
      return { success: false, message: 'DLQ record not found' };
    }

    try {
      if (record.queueName === 'receipts-queue') {
        await this.receiptsQueue.add(record.jobName, record.data, {
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
        });
      } else if (record.queueName === 'notifications-queue') {
        await this.notificationsQueue.add(record.jobName, record.data, {
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
        });
      } else if (record.queueName === 'reminders-queue') {
        await this.remindersQueue.add(record.jobName, record.data, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        });
      }

      // Remove from DLQ on successful requeue
      this.failedRecords.delete(id);
      this.logger.log(`DLQ job ${id} successfully re-enqueued to ${record.queueName}`);
      return { success: true, message: `Job successfully re-queued to ${record.queueName}` };
    } catch (err: any) {
      this.logger.error(`Failed to requeue DLQ job ${id}: ${err.message}`);
      return { success: false, message: err.message };
    }
  }

  /**
   * Clears a failed job from DLQ.
   */
  async deleteFailedJob(id: string): Promise<boolean> {
    return this.failedRecords.delete(id);
  }
}

