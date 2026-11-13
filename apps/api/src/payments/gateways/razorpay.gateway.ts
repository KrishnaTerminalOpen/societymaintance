import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import type RazorpayType from 'razorpay';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const RazorpayModule = require('razorpay');
const RazorpayCtor = (RazorpayModule?.default ?? RazorpayModule) as typeof RazorpayType;
import {
  IPaymentGateway,
  CreateGatewayOrderParams,
  GatewayOrderResult,
  VerifyPaymentParams,
  GatewayPaymentDetails,
  GatewayRefundParams,
  GatewayRefundResult,
} from '../interfaces/gateway.interface';

@Injectable()
export class RazorpayGateway implements IPaymentGateway {
  readonly name = 'Razorpay';
  private readonly logger = new Logger(RazorpayGateway.name);
  private razorpayClient: RazorpayType | null = null;
  private isTestMode: boolean;
  private keyId: string;
  private keySecret: string;
  private webhookSecret: string;
  private isMockMode: boolean;

  constructor(private configService: ConfigService) {
    this.keyId = this.configService.get<string>('RAZORPAY_KEY_ID') || 'rzp_test_YourTestKeyIdHere';
    this.keySecret = this.configService.get<string>('RAZORPAY_KEY_SECRET') || 'YourRazorpaySecretKeyHere';
    this.webhookSecret = this.configService.get<string>('RAZORPAY_WEBHOOK_SECRET') || 'YourRazorpayWebhookSecretHere';
    
    // Live mode vs Test mode check
    this.isTestMode = this.keyId.startsWith('rzp_test_');

    // Use mock mode if dummy placeholder credentials or if explicitly configured
    this.isMockMode =
      this.configService.get<string>('RAZORPAY_MOCK') === 'true' ||
      this.keyId === 'rzp_test_YourTestKeyIdHere' ||
      this.keySecret === 'YourRazorpaySecretKeyHere';

    if (this.isMockMode) {
      this.logger.warn('⚠️ Razorpay configured with dummy/mock credentials. Mock Gateway Active.');
    } else {
      this.razorpayClient = new RazorpayCtor({
        key_id: this.keyId,
        key_secret: this.keySecret,
      });
      this.logger.log(`Initialized Razorpay Gateway [Mode: ${this.isTestMode ? 'TEST' : 'LIVE'}]`);
    }
  }

  getKeyId(): string {
    return this.keyId;
  }

  /**
   * Creates an order with Razorpay in paise.
   */
  async createOrder(params: CreateGatewayOrderParams): Promise<GatewayOrderResult> {
    const amount = Number(params.amountPaise);

    if (this.isMockMode || !this.razorpayClient) {
      const mockOrderId = `order_mock_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      return {
        orderId: mockOrderId,
        amountPaise: amount,
        currency: params.currency || 'INR',
        status: 'created',
      };
    }

    try {
      const order = await this.razorpayClient.orders.create({
        amount,
        currency: params.currency || 'INR',
        receipt: params.receipt,
        notes: params.notes,
      });

      return {
        orderId: order.id,
        amountPaise: Number(order.amount),
        currency: order.currency,
        status: order.status,
      };
    } catch (error) {
      this.logger.error('Failed to create Razorpay order:', error);
      throw new Error(
        `Razorpay order creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Verifies Razorpay checkout signature: HMAC-SHA256(order_id + "|" + payment_id, secret)
   */
  verifyPayment(params: VerifyPaymentParams): boolean {
    const { orderId, paymentId, signature } = params;

    // In mock mode, if signature equals "valid_signature" or matches calculated HMAC, accept
    if (this.isMockMode && signature === 'valid_mock_signature') {
      return true;
    }

    try {
      const body = `${orderId}|${paymentId}`;
      const expectedSignature = createHmac('sha256', this.keySecret)
        .update(body)
        .digest('hex');

      return expectedSignature === signature;
    } catch (error) {
      this.logger.error('Signature verification threw exception:', error);
      return false;
    }
  }

  /**
   * Verifies incoming webhook HMAC-SHA256 signature against webhook secret.
   */
  verifyWebhookSignature(rawBody: string, signature: string, secret?: string): boolean {
    const secretToUse = secret || this.webhookSecret;

    if (this.isMockMode && signature === 'valid_mock_webhook_signature') {
      return true;
    }

    try {
      const expectedSignature = createHmac('sha256', secretToUse)
        .update(rawBody)
        .digest('hex');

      return expectedSignature === signature;
    } catch (error) {
      this.logger.error('Webhook signature verification exception:', error);
      return false;
    }
  }

  /**
   * Fetches latest payment details from Razorpay API.
   */
  async fetchPayment(paymentId: string): Promise<GatewayPaymentDetails> {
    if (this.isMockMode || !this.razorpayClient) {
      return {
        paymentId,
        amountPaise: 4000000,
        currency: 'INR',
        status: 'captured',
        method: 'upi',
        vpa: 'resident@okhdfcbank',
        captured: true,
      };
    }

    try {
      const payment: any = await this.razorpayClient.payments.fetch(paymentId);
      return {
        paymentId: payment.id,
        orderId: payment.order_id,
        amountPaise: Number(payment.amount),
        currency: payment.currency,
        status: payment.status,
        method: payment.method || 'upi',
        bank: payment.bank,
        wallet: payment.wallet,
        vpa: payment.vpa,
        email: payment.email,
        contact: payment.contact,
        errorCode: payment.error_code,
        errorDescription: payment.error_description,
        captured: payment.captured,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch payment ${paymentId}:`, error);
      throw new Error(`Razorpay fetch payment failed: ${paymentId}`);
    }
  }

  /**
   * Fetches settled transactions from Razorpay for reconciliation within a date range.
   */
  async fetchSettledPayments(from?: Date, to?: Date): Promise<GatewayPaymentDetails[]> {
    if (this.isMockMode || !this.razorpayClient) {
      // In mock/dev mode, return simulated gateway transactions
      return [
        {
          paymentId: 'pay_rzp_mock_live_101',
          orderId: 'order_mock_test_1',
          amountPaise: 4000000,
          currency: 'INR',
          status: 'captured',
          method: 'upi',
          vpa: 'resident@okhdfcbank',
          captured: true,
        },
        {
          paymentId: 'pay_rzp_mock_live_102',
          orderId: 'order_mock_test_2',
          amountPaise: 2500000,
          currency: 'INR',
          status: 'captured',
          method: 'netbanking',
          bank: 'HDFC',
          captured: true,
        },
        {
          paymentId: 'pay_rzp_unreconciled_999',
          orderId: 'order_unreconciled_999',
          amountPaise: 5000000,
          currency: 'INR',
          status: 'captured',
          method: 'upi',
          vpa: 'mismatch@okaxis',
          captured: true,
        },
      ];
    }

    try {
      const fromTimestamp = from ? Math.floor(from.getTime() / 1000) : Math.floor((Date.now() - 30 * 86400000) / 1000);
      const toTimestamp = to ? Math.floor(to.getTime() / 1000) : Math.floor(Date.now() / 1000);

      const response: any = await this.razorpayClient.payments.all({
        from: fromTimestamp,
        to: toTimestamp,
        count: 100,
      });

      const items = response.items || [];
      return items.map((payment: any) => ({
        paymentId: payment.id,
        orderId: payment.order_id,
        amountPaise: Number(payment.amount),
        currency: payment.currency,
        status: payment.status,
        method: payment.method || 'upi',
        bank: payment.bank,
        wallet: payment.wallet,
        vpa: payment.vpa,
        email: payment.email,
        contact: payment.contact,
        errorCode: payment.error_code,
        errorDescription: payment.error_description,
        captured: payment.captured,
      }));
    } catch (error) {
      this.logger.error('Failed to fetch settled payments from Razorpay:', error);
      throw new Error(`Razorpay fetchSettledPayments failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fetches settled refunds from Razorpay for reconciliation within a date range.
   */
  async fetchSettledRefunds(from?: Date, to?: Date): Promise<GatewayRefundResult[]> {
    if (this.isMockMode || !this.razorpayClient) {
      return [
        {
          refundId: 'rfnd_mock_settled_1',
          paymentId: 'pay_rzp_mock_live_101',
          amountPaise: 1000000,
          status: 'processed',
        },
      ];
    }

    try {
      const fromTimestamp = from ? Math.floor(from.getTime() / 1000) : Math.floor((Date.now() - 30 * 86400000) / 1000);
      const toTimestamp = to ? Math.floor(to.getTime() / 1000) : Math.floor(Date.now() / 1000);

      const response: any = await (this.razorpayClient as any).refunds.all({
        from: fromTimestamp,
        to: toTimestamp,
        count: 100,
      });

      const items = response.items || [];
      return items.map((refund: any) => ({
        refundId: refund.id,
        paymentId: refund.payment_id,
        amountPaise: Number(refund.amount),
        status: refund.status,
      }));
    } catch (error) {
      this.logger.error('Failed to fetch settled refunds from Razorpay:', error);
      throw new Error(`Razorpay fetchSettledRefunds failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Initiates a refund for an existing payment via Razorpay Refund API.
   */
  async refund(params: GatewayRefundParams): Promise<GatewayRefundResult> {
    const amount = Number(params.amountPaise);

    if (this.isMockMode || !this.razorpayClient) {
      return {
        refundId: `rfn_mock_${Date.now()}`,
        paymentId: params.paymentId,
        amountPaise: amount,
        status: 'processed',
      };
    }

    try {
      const refund: any = await this.razorpayClient.payments.refund(params.paymentId, {
        amount,
        notes: params.notes,
      });

      return {
        refundId: refund.id,
        paymentId: refund.payment_id,
        amountPaise: Number(refund.amount),
        status: refund.status,
      };
    } catch (error) {
      this.logger.error(`Failed to refund payment ${params.paymentId}:`, error);
      throw new Error(
        `Razorpay refund failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}

