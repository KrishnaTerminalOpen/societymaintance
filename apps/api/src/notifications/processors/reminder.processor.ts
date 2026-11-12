import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { prisma, DepositStatus, AuditAction } from '@colony/database';
import { DeadLetterQueueService } from '../dlq.service';

export interface SendBulkRemindersJobData {
  block?: string;
  depositStatus?: 'PENDING' | 'OVERDUE' | 'ALL';
  channel?: 'SMS' | 'EMAIL' | 'WHATSAPP' | 'ALL';
  batchSize?: number;
  delayBetweenBatchesMs?: number;
  adminId?: string;
}

@Processor('reminders-queue')
@Injectable()
export class ReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(ReminderProcessor.name);

  constructor(
    @InjectQueue('notifications-queue') private readonly notificationsQueue: Queue,
    private readonly dlqService: DeadLetterQueueService,
  ) {
    super();
  }

  async process(job: Job<SendBulkRemindersJobData>): Promise<any> {
    const {
      block,
      depositStatus = 'ALL',
      channel = 'ALL',
      batchSize = 10,
      delayBetweenBatchesMs = 3000,
      adminId,
    } = job.data;

    this.logger.log(
      `[ReminderWorker] Processing bulk reminders (Block: ${block || 'ALL'}, Status: ${depositStatus}, BatchSize: ${batchSize}, Delay: ${delayBetweenBatchesMs}ms)`,
    );

    try {
      // 1. Build Query Filter
      const where: any = {};

      if (depositStatus === 'OVERDUE') {
        where.status = DepositStatus.OVERDUE;
      } else if (depositStatus === 'PENDING') {
        where.status = { in: [DepositStatus.PENDING, DepositStatus.PARTIAL] };
      } else {
        where.status = { in: [DepositStatus.PENDING, DepositStatus.PARTIAL, DepositStatus.OVERDUE] };
      }

      if (block) {
        where.house = { block };
      }

      // Fetch eligible deposits with houses and residents
      const deposits = await prisma.deposit.findMany({
        where,
        include: {
          house: {
            include: {
              owner: true,
            },
          },
        },
      });

      if (deposits.length === 0) {
        this.logger.log('[ReminderWorker] No residents found matching criteria for deposit reminders.');
        return { count: 0, batches: 0 };
      }

      // 2. Fetch Colony Branding Setting
      const setting = await prisma.setting.findFirst();
      const colonyName = setting?.colonyName || 'Colony RWA';

      // 3. Split deposits into batches to avoid traffic spikes
      const batches: (typeof deposits)[] = [];
      for (let i = 0; i < deposits.length; i += batchSize) {
        batches.push(deposits.slice(i, i + batchSize));
      }

      let enqueuedJobsCount = 0;

      // 4. Schedule each batch with progressive delays
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const currentBatch = batches[batchIndex];
        const batchDelay = batchIndex * delayBetweenBatchesMs;

        for (const deposit of currentBatch) {
          const user = deposit.house.owner;
          if (!user) continue;

          const remainingDue = deposit.amountDue - deposit.amountPaid;
          const isOverdue = deposit.status === DepositStatus.OVERDUE || new Date(deposit.dueDate) < new Date();
          const notificationType = isOverdue ? 'PAYMENT_OVERDUE' : 'PAYMENT_DUE';

          await this.notificationsQueue.add(
            'dispatch-notification',
            {
              userId: user.id,
              type: notificationType,
              channel,
              phone: user.phone,
              email: user.email,
              metadata: {
                colonyName,
                amountPaise: Number(remainingDue),
                unit: `Block ${deposit.house.block}-${deposit.house.houseNumber}`,
                dueDate: deposit.dueDate.toISOString(),
                batchIndex,
              },
            },
            {
              delay: batchDelay,
              attempts: 5,
              backoff: { type: 'exponential', delay: 2000 },
            },
          );

          enqueuedJobsCount++;
        }
      }

      // 5. Record in Audit Log
      await prisma.auditLog.create({
        data: {
          actorId: adminId || 'SYSTEM_BULK_REMINDER',
          action: AuditAction.UPDATE,
          entity: 'Deposit',
          entityId: 'BULK_REMINDERS',
          before: { criteria: { block, depositStatus } },
          after: {
            totalRemindersScheduled: enqueuedJobsCount,
            batchesCount: batches.length,
            delayBetweenBatchesMs,
          },
        },
      });

      this.logger.log(
        `[ReminderWorker] Scheduled ${enqueuedJobsCount} reminders across ${batches.length} batches with ${delayBetweenBatchesMs}ms staggered delays.`,
      );

      return {
        success: true,
        totalRemindersScheduled: enqueuedJobsCount,
        batchesCount: batches.length,
      };
    } catch (error: any) {
      this.logger.error(`[ReminderWorker] Failed bulk reminder processing: ${error.message}`);
      if (job.attemptsMade >= 2) {
        await this.dlqService.recordFailedJob(job, error);
      }
      throw error;
    }
  }
}

