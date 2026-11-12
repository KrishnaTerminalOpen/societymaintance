import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentsService } from '../src/payments/payments.service';
import { RazorpayGateway } from '../src/payments/gateways/razorpay.gateway';
import { prisma, PaymentStatus, DepositStatus } from '@colony/database';
import { WebhookProcessor } from '../src/payments/processors/webhook.processor';
import { ConfigService } from '@nestjs/config';

describe('Payments Module - Concurrency, Gateway & Failure Scenarios', () => {
  let gateway: RazorpayGateway;
  let service: PaymentsService;
  let webhookProcessor: WebhookProcessor;

  const mockResidentAuth = {
    id: 'usr_res_aarav',
    phone: '+919811100001',
    role: 'RESIDENT' as const,
    name: 'Aarav Verma',
  };

  const mockDeposit = {
    id: 'dep_101',
    houseId: 'house_101',
    title: 'Security Deposit 2026',
    amountDue: 4000000n, // ₹40,000
    amountPaid: 0n,
    status: DepositStatus.PENDING,
    dueDate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    house: {
      id: 'house_101',
      block: 'A',
      houseNumber: '101',
      type: 'FLAT_2BHK' as const,
      ownerId: 'usr_res_aarav',
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    const configService = {
      get: vi.fn((key: string) => {
        if (key === 'RAZORPAY_KEY_ID') return 'rzp_test_YourTestKeyIdHere';
        if (key === 'RAZORPAY_KEY_SECRET') return 'YourRazorpaySecretKeyHere';
        if (key === 'RAZORPAY_MOCK') return 'true';
        return undefined;
      }),
    } as unknown as ConfigService;

    gateway = new RazorpayGateway(configService);
    service = new PaymentsService(gateway);
    webhookProcessor = new WebhookProcessor(service);
  });

  // ============================================================================
  // Scenario 1: Double-Click / Idempotency Key Safety
  // ============================================================================
  it('Scenario 1: Prevents double charges on rapid double-clicks using idempotencyKey', async () => {
    const idempotencyKey = 'idemp_double_click_test_123';

    vi.spyOn(prisma.deposit, 'findUnique').mockResolvedValue(mockDeposit as any);
    vi.spyOn(prisma.payment, 'findUnique')
      .mockResolvedValueOnce(null) // First call: no payment exists yet
      .mockResolvedValueOnce({
        id: 'pay_created_1',
        depositId: mockDeposit.id,
        userId: mockResidentAuth.id,
        amount: 4000000n,
        status: PaymentStatus.CREATED,
        gatewayOrderId: 'order_mock_test_1',
        idempotencyKey,
      } as any);

    vi.spyOn(prisma.payment, 'create').mockResolvedValue({
      id: 'pay_created_1',
      depositId: mockDeposit.id,
      userId: mockResidentAuth.id,
      amount: 4000000n,
      status: PaymentStatus.CREATED,
      gatewayOrderId: 'order_mock_test_1',
      idempotencyKey,
    } as any);

    vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

    // Click 1: First request generates order
    const firstCall = await service.createOrder(
      { depositId: mockDeposit.id, idempotencyKey },
      mockResidentAuth,
    );
    expect(firstCall.orderId).toBeDefined();
    expect(firstCall.isReused).toBe(false);

    // Click 2: Second concurrent/identical request reuses existing order without charging twice
    const secondCall = await service.createOrder(
      { depositId: mockDeposit.id, idempotencyKey },
      mockResidentAuth,
    );
    expect(secondCall.orderId).toBe('order_mock_test_1');
    expect(secondCall.isReused).toBe(true);
  });

  // ============================================================================
  // Scenario 2: Amount Tampering Prevention
  // ============================================================================
  it('Scenario 2: Rejects client amount tampering (exceeding balance or below minimum ₹1,000)', async () => {
    vi.spyOn(prisma.deposit, 'findUnique').mockResolvedValue(mockDeposit as any);

    // Attempt to tamper with amount: send ₹50,000 (5,000,000 paise) when due is only ₹40,000 (4,000,000 paise)
    await expect(
      service.createOrder(
        {
          depositId: mockDeposit.id,
          requestedAmountPaise: 5000000,
          idempotencyKey: 'idemp_tamper_1',
        },
        mockResidentAuth,
      ),
    ).rejects.toThrow('Amount tampering detected: Requested amount');

    // Attempt to send sub-minimum amount: ₹500 (50,000 paise)
    await expect(
      service.createOrder(
        {
          depositId: mockDeposit.id,
          requestedAmountPaise: 50000,
          idempotencyKey: 'idemp_tamper_2',
        },
        mockResidentAuth,
      ),
    ).rejects.toThrow('Minimum partial payment is ₹1,000');
  });

  // ============================================================================
  // Scenario 3: Duplicate Webhooks (Never Double-Credit)
  // ============================================================================
  it('Scenario 3: Skips duplicate webhooks to guarantee idempotent asynchronous processing', async () => {
    const handleSpy = vi.spyOn(service, 'handleWebhookPayload').mockResolvedValue(undefined);

    const mockJob = {
      id: 'job_webhook_1',
      data: {
        eventId: 'evt_razorpay_unique_101',
        event: {
          event: 'payment.captured',
          payload: {
            payment: {
              entity: { id: 'pay_rzp_1', order_id: 'order_1', amount: 4000000 },
            },
          },
        },
      },
    } as any;

    // Delivery 1: Processed
    const res1 = await webhookProcessor.process(mockJob);
    expect(res1.status).toBe('success');
    expect(handleSpy).toHaveBeenCalledTimes(1);

    // Delivery 2: Exact duplicate webhook arrives from Razorpay retry
    const res2 = await webhookProcessor.process(mockJob);
    expect(res2.status).toBe('skipped_duplicate');
    // Service handler was NOT invoked a second time
    expect(handleSpy).toHaveBeenCalledTimes(1);
  });

  // ============================================================================
  // Scenario 4: Webhook Arrives Before /verify (Race Condition Handling)
  // ============================================================================
  it('Scenario 4: Handles Webhook arriving before client /verify without double-crediting', async () => {
    const existingPayment = {
      id: 'pay_record_1',
      depositId: mockDeposit.id,
      userId: mockResidentAuth.id,
      amount: 4000000n,
      status: PaymentStatus.SUCCESS, // Already marked SUCCESS by prior webhook
      gatewayOrderId: 'order_rzp_race_1',
      deposit: mockDeposit,
      user: mockResidentAuth,
    };

    vi.spyOn(prisma.payment, 'findFirst').mockResolvedValue(existingPayment as any);
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      const tx = {
        payment: {
          findUnique: vi.fn().mockResolvedValue(existingPayment),
        },
        receipt: {
          findUnique: vi.fn().mockResolvedValue({ receiptNumber: 'REC-2026-1001' }),
        },
        deposit: {
          findUnique: vi.fn().mockResolvedValue(mockDeposit),
        },
      };
      return callback(tx);
    });

    vi.spyOn(gateway, 'verifyPayment').mockReturnValue(true);

    // Client hits POST /payments/verify
    const result = await service.verifyPayment({
      razorpayOrderId: 'order_rzp_race_1',
      razorpayPaymentId: 'pay_rzp_race_1',
      razorpaySignature: 'valid_mock_signature',
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain('already verified');
    expect(result.receiptNumber).toBe('REC-2026-1001');
  });

  // ============================================================================
  // Scenario 5: Payment Closed Midway / Abandoned in Checkout
  // ============================================================================
  it('Scenario 5: Background poller detects payments abandoned > 30 mins and updates status to FAILED', async () => {
    const abandonedPayment = {
      id: 'pay_abandoned_1',
      depositId: mockDeposit.id,
      userId: mockResidentAuth.id,
      amount: 4000000n,
      status: PaymentStatus.CREATED,
      gatewayOrderId: 'order_abandoned_rzp_1',
      gatewayPaymentId: null,
      createdAt: new Date(Date.now() - 45 * 60 * 1000), // 45 minutes ago
      isOffline: false,
    };

    vi.spyOn(prisma.payment, 'findMany').mockResolvedValue([abandonedPayment as any]);
    const updateSpy = vi.spyOn(prisma.payment, 'update').mockResolvedValue({} as any);
    vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

    const resolvedCount = await service.pollStuckPayments();

    expect(resolvedCount).toBe(1);
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: abandonedPayment.id },
      data: { status: PaymentStatus.FAILED },
    });
  });
});
