import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole, prisma } from '@colony/database';
import { DeadLetterQueueService } from './dlq.service';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(
    @InjectQueue('reminders-queue') private readonly remindersQueue: Queue,
    @InjectQueue('notifications-queue') private readonly notificationsQueue: Queue,
    private readonly notificationsService: NotificationsService,
    private readonly dlqService: DeadLetterQueueService,
  ) {}

  /**
   * POST /notifications/send-reminder
   * Admin endpoint to send single or batched bulk reminders.
   */
  @Post('send-reminder')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async sendReminder(@Body() body: any, @Req() req: any) {
    const admin = req.user;

    // Single resident reminder
    if (body.userId) {
      const user = await prisma.user.findUnique({
        where: { id: body.userId },
        include: {
          houses: {
            include: {
              deposits: true,
            },
          },
        },
      });

      if (!user) {
        throw new BadRequestException('Target resident not found');
      }

      const activeDeposit = user.houses[0]?.deposits[0];
      const isOverdue = activeDeposit ? new Date(activeDeposit.dueDate) < new Date() : false;

      const job = await this.notificationsQueue.add(
        'dispatch-notification',
        {
          userId: user.id,
          type: isOverdue ? 'PAYMENT_OVERDUE' : 'PAYMENT_DUE',
          channel: body.channel || 'ALL',
          metadata: {
            amountPaise: activeDeposit ? Number(activeDeposit.amountDue - activeDeposit.amountPaid) : undefined,
            dueDate: activeDeposit?.dueDate.toISOString(),
            unit: user.houses[0] ? `Block ${user.houses[0].block}-${user.houses[0].houseNumber}` : undefined,
          },
        },
        {
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );

      return {
        success: true,
        message: `Reminder enqueued for ${user.name}`,
        jobId: job.id,
      };
    }

    // Bulk reminders with batching & delays
    const bulkJob = await this.remindersQueue.add(
      'send-bulk-reminders',
      {
        block: body.block || undefined,
        depositStatus: body.depositStatus || 'ALL',
        channel: body.channel || 'ALL',
        batchSize: body.batchSize ? Number(body.batchSize) : 10,
        delayBetweenBatchesMs: body.delayBetweenBatchesMs ? Number(body.delayBetweenBatchesMs) : 3000,
        adminId: admin.id,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );

    return {
      success: true,
      message: 'Bulk reminders dispatch queued successfully with staggered batch delays.',
      jobId: bulkJob.id,
    };
  }

  /**
   * GET /notifications/failed-jobs
   * DLQ viewer for admins to review failed worker jobs and stack traces.
   */
  @Get('failed-jobs')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getFailedJobs() {
    const failedJobs = await this.dlqService.getFailedJobs();
    return {
      success: true,
      count: failedJobs.length,
      data: failedJobs,
    };
  }

  /**
   * POST /notifications/retry-failed-job
   * Admin trigger to retry a failed job from the Dead Letter Queue.
   */
  @Post('retry-failed-job')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async retryFailedJob(@Body('id') id: string) {
    if (!id) {
      throw new BadRequestException('DLQ Record ID is required');
    }
    const result = await this.dlqService.retryFailedJob(id);
    return result;
  }

  /**
   * DELETE /notifications/failed-jobs/:id
   * Admin action to dismiss a failed job.
   */
  @Delete('failed-jobs/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async deleteFailedJob(@Param('id') id: string) {
    const deleted = await this.dlqService.deleteFailedJob(id);
    return { success: deleted };
  }
}

