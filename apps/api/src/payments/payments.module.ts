import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PaymentsController } from './payments.controller';
import { WebhooksController } from './webhooks.controller';
import { PaymentsService } from './payments.service';
import { RazorpayGateway } from './gateways/razorpay.gateway';
import { WebhookProcessor } from './processors/webhook.processor';
import { StuckPaymentsPollerJob } from './jobs/stuck-payments.job';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'payment-webhooks',
    }),
  ],
  controllers: [PaymentsController, WebhooksController],
  providers: [
    PaymentsService,
    RazorpayGateway,
    WebhookProcessor,
    StuckPaymentsPollerJob,
  ],
  exports: [PaymentsService, RazorpayGateway],
})
export class PaymentsModule {}

