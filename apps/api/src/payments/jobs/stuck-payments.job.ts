import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentsService } from '../payments.service';

@Injectable()
export class StuckPaymentsPollerJob {
  private readonly logger = new Logger(StuckPaymentsPollerJob.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Runs every 10 minutes to scan for payments stuck in CREATED / PENDING state > 30 minutes
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleStuckPaymentsCron() {
    this.logger.log('Starting Scheduled Poller: Checking for stuck unconfirmed payments...');
    try {
      const resolved = await this.paymentsService.pollStuckPayments();
      this.logger.log(`Scheduled Poller Complete: Reconciled / updated ${resolved} payments.`);
    } catch (error) {
      this.logger.error('Error during stuck payments cron execution:', error);
    }
  }
}
