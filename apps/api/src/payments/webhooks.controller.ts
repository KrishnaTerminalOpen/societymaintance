import {
  Controller,
  Post,
  Headers,
  Req,
  HttpCode,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Request } from 'express';
import { RazorpayGateway } from './gateways/razorpay.gateway';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly gateway: RazorpayGateway,
    @InjectQueue('payment-webhooks') private readonly webhookQueue: Queue,
  ) {}

  @Post('razorpay')
  @HttpCode(200)
  async handleRazorpayWebhook(
    @Req() req: Request,
    @Headers('x-razorpay-signature') signature: string,
  ) {
    if (!signature) {
      this.logger.warn('Webhook received without x-razorpay-signature header');
      throw new BadRequestException('Missing x-razorpay-signature header');
    }

    // Extract raw body or stringified body
    const rawBody =
      typeof req.body === 'string'
        ? req.body
        : (req as any).rawBody
          ? (req as any).rawBody.toString('utf8')
          : JSON.stringify(req.body);

    // 1. Cryptographic Signature Verification
    const isValid = this.gateway.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      this.logger.error('Invalid Razorpay webhook signature detected!');
      throw new BadRequestException('Invalid webhook signature');
    }

    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const eventId = (req.headers['x-razorpay-event-id'] as string) || payload?.account_id + '_' + Date.now();

    // 2. Respond within 1 second: Enqueue in BullMQ for asynchronous idempotent execution
    await this.webhookQueue.add(
      'process-webhook',
      {
        event: payload,
        eventId,
        receivedAt: Date.now(),
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
      },
    );

    this.logger.log(`Razorpay webhook [${payload?.event}] enqueued successfully. Immediate 200 returned.`);

    // 3. Immediate HTTP 200 response
    return {
      received: true,
      eventId,
      status: 'queued',
    };
  }
}

