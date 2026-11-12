import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReconciliationService } from './reconciliation.service';

@Injectable()
export class ReconciliationJob {
  private readonly logger = new Logger(ReconciliationJob.name);

  constructor(private readonly reconciliationService: ReconciliationService) {}

  /**
   * Automated Daily Reconciliation Job
   * Runs every night at midnight to compare Razorpay gateway settlements against DB.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async runDailyReconciliation() {
    this.logger.log('Executing automated daily reconciliation cron job...');

    try {
      const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
      const today = new Date();

      const report = await this.reconciliationService.runReconciliation(yesterday, today);

      if (report.metrics.discrepancyCount > 0) {
        this.logger.warn(
          `⚠️ Daily Reconciliation Alert: Found ${report.metrics.discrepancyCount} discrepancies! (Missing: ${report.metrics.missingInDbCount}, Status Mismatches: ${report.metrics.statusMismatchCount})`,
        );
      } else {
        this.logger.log(
          `✅ Daily Reconciliation Clean: 0 discrepancies across ${report.metrics.totalTransactions} transactions.`,
        );
      }
    } catch (err: any) {
      this.logger.error(`Daily Reconciliation Job Error: ${err.message}`, err.stack);
    }
  }
}

