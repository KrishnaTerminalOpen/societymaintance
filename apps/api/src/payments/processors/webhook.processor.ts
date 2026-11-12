import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PaymentsService } from '../payments.service';
import { getCacheStore } from '@colony/shared';

@Processor('payment-webhooks')
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(private readonly paymentsService: PaymentsService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { event, eventId } = job.data;
    this.logger.log(`Processing async webhook job ${job.id}: [${event?.event}] ID: ${eventId}`);

    // Idempotency check for duplicate webhooks
    if (eventId) {
      const cache = getCacheStore();
      const idempotencyKey = `webhook:processed:${eventId}`;
      const alreadyProcessed = await cache.get(idempotencyKey);

      if (alreadyProcessed) {
        this.logger.warn(`Duplicate webhook event ${eventId} already processed. Skipping to avoid double-crediting.`);
        return { status: 'skipped_duplicate', eventId };
      }

      // Mark as processed with 24 hours expiry
      await cache.setex(idempotencyKey, 86400, 'processed');
    }

    try {
      await this.paymentsService.handleWebhookPayload(event);
      return { status: 'success', eventId };
    } catch (error) {
      this.logger.error(`Error processing webhook event ${eventId}:`, error);
      throw error;
    }
  }
}
