import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentsService, ReviewRefundDto } from '../src/payments/payments.service';
import { RazorpayGateway } from '../src/payments/gateways/razorpay.gateway';
import { ReconciliationService } from '../src/reconciliation/reconciliation.service';
import { prisma, PaymentStatus, DepositStatus, AuditAction } from '@colony/database';
import { ConfigService } from '@nestjs/config';

describe('Module 7: Refunds, Anti-Double-Refund & Reconciliation', () => {
  let gateway: RazorpayGateway;
  let paymentsService: PaymentsService;
  let reconciliationService: ReconciliationService;

  const mockAdminAuth = {
    id: 'usr_admin_1',
    phone: '+919800000002',
    role: 'ADMIN' as const,
    name: 'Admin Committee',
  };

  const mockPayment = {
    id: 'pay_succ_101',
    depositId: 'dep_101',
    userId: 'usr_res_101',
    amount: 5000000n, // ₹50,000 in paise
    method: 'UPI',
    gatewayOrderId: 'order_101',
    gatewayPaymentId: 'pay_rzp_mock_live_101',
    status: PaymentStatus.SUCCESS,
    deposit: {
      id: 'dep_101',
      amountDue: 5000000n,
      amountPaid: 5000000n,
      status: DepositStatus.PAID,
      house: { block: 'A', houseNumber: '101' },
    },
    user: { id: 'usr_res_101', name: 'Rohan Sharma', phone: '+919811122233' },
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    const configService = {
      get: vi.fn((key: string) => {
        if (key === 'RAZORPAY_MOCK') return 'true';
        return undefined;
      }),
    } as unknown as ConfigService;

    gateway = new RazorpayGateway(configService);
    paymentsService = new PaymentsService(gateway);
    reconciliationService = new ReconciliationService(gateway);

    // Mock $transaction to run callback immediately with mocked prisma
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      return cb(prisma);
    });
  });

  describe('Refund Approvals & Anti-Over-Refund Guard', () => {
    it('prevents refunding more than the original payment amount', async () => {
      const mockRefund = {
        id: 'rfnd_req_1',
        paymentId: mockPayment.id,
        amount: 6000000n, // ₹60,000 (exceeds ₹50,000 paid)
        reason: 'Tenancy ended, full deposit return',
        status: 'PENDING',
        payment: mockPayment,
      };

      vi.spyOn(prisma.refund, 'findUnique').mockResolvedValue(mockRefund as any);
      vi.spyOn(prisma.refund, 'findMany').mockResolvedValue([]); // No prior refunds

      const dto: ReviewRefundDto = {
        refundId: 'rfnd_req_1',
        action: 'APPROVE',
      };

      await expect(
        paymentsService.reviewRefundRequest(dto, mockAdminAuth),
      ).rejects.toThrow(/exceed original paid amount/);
    });

    it('prevents double refunds (cannot review already processed refund)', async () => {
      const mockAlreadyProcessed = {
        id: 'rfnd_req_2',
        paymentId: mockPayment.id,
        amount: 2000000n,
        reason: 'Duplicate attempt',
        status: 'PROCESSED', // Already processed
        payment: mockPayment,
      };

      vi.spyOn(prisma.refund, 'findUnique').mockResolvedValue(mockAlreadyProcessed as any);

      const dto: ReviewRefundDto = {
        refundId: 'rfnd_req_2',
        action: 'APPROVE',
      };

      await expect(
        paymentsService.reviewRefundRequest(dto, mockAdminAuth),
      ).rejects.toThrow(/already been reviewed/);
    });

    it('approves partial refund: marks PARTIALLY_REFUNDED and updates deposit balance', async () => {
      const partialPaise = 2000000n; // ₹20,000
      const mockRefund = {
        id: 'rfnd_req_3',
        paymentId: mockPayment.id,
        amount: partialPaise,
        reason: 'Partial dispute adjustment',
        status: 'PENDING',
        payment: mockPayment,
      };

      vi.spyOn(prisma.refund, 'findUnique').mockResolvedValue(mockRefund as any);
      vi.spyOn(prisma.refund, 'findMany').mockResolvedValue([]); // No prior refunds
      vi.spyOn(prisma.refund, 'update').mockResolvedValue({
        ...mockRefund,
        status: 'PROCESSED',
        gatewayRefundId: 'rfnd_rzp_123',
      } as any);
      vi.spyOn(prisma.payment, 'update').mockResolvedValue({} as any);
      vi.spyOn(prisma.deposit, 'update').mockResolvedValue({} as any);
      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

      const result = await paymentsService.reviewRefundRequest(
        { refundId: 'rfnd_req_3', action: 'APPROVE' },
        mockAdminAuth,
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe('PROCESSED');
      expect(result.paymentStatus).toBe(PaymentStatus.PARTIALLY_REFUNDED);
      expect(result.newDepositPaidPaise).toBe(3000000); // 50,000 - 20,000 = 30,000
    });

    it('handles admin rejection with committee reason', async () => {
      const mockRefund = {
        id: 'rfnd_req_4',
        paymentId: mockPayment.id,
        amount: 1000000n,
        reason: 'Maintenance fee deduction dispute',
        status: 'PENDING',
        payment: mockPayment,
      };

      vi.spyOn(prisma.refund, 'findUnique').mockResolvedValue(mockRefund as any);
      vi.spyOn(prisma.refund, 'update').mockResolvedValue({
        ...mockRefund,
        status: 'FAILED',
      } as any);
      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

      const result = await paymentsService.reviewRefundRequest(
        {
          refundId: 'rfnd_req_4',
          action: 'REJECT',
          reason: 'Deductions are valid per society by-laws clause 4',
        },
        mockAdminAuth,
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe('REJECTED');
    });
  });

  describe('Reconciliation Engine', () => {
    it('compares gateway against database and accurately detects matched & mismatched items', async () => {
      // Mock DB payments matching one gateway payment and one discrepancy
      vi.spyOn(prisma.payment, 'findMany').mockResolvedValue([
        {
          id: 'db_pay_1',
          gatewayPaymentId: 'pay_rzp_mock_live_101',
          gatewayOrderId: 'order_mock_test_1',
          amount: 4000000n, // ₹40,000 matches gateway
          status: PaymentStatus.SUCCESS,
          createdAt: new Date(),
          user: { name: 'Aarav Verma' },
          deposit: { house: { block: 'A', houseNumber: '101' } },
          receipt: { receiptNumber: 'REC-2026-1001' },
        },
        {
          id: 'db_pay_2',
          gatewayPaymentId: 'pay_rzp_mock_live_102',
          gatewayOrderId: 'order_mock_test_2',
          amount: 2500000n,
          status: PaymentStatus.CREATED, // STATUS_MISMATCH (GW is captured, DB is CREATED)
          createdAt: new Date(),
          user: { name: 'Kavita Patel' },
          deposit: { house: { block: 'B', houseNumber: '202' } },
          receipt: null,
        },
      ] as any);

      const report = await reconciliationService.runReconciliation();

      expect(report.metrics.totalTransactions).toBeGreaterThanOrEqual(2);
      expect(report.metrics.matchedCount).toBeGreaterThanOrEqual(1);

      const statusMismatch = report.items.find((i) => i.discrepancyType === 'STATUS_MISMATCH');
      expect(statusMismatch).toBeDefined();
      expect(statusMismatch?.gatewayPaymentId).toBe('pay_rzp_mock_live_102');

      const missingInDb = report.items.find((i) => i.discrepancyType === 'MISSING_IN_DB');
      expect(missingInDb).toBeDefined();
      expect(missingInDb?.gatewayPaymentId).toBe('pay_rzp_unreconciled_999');
    });

    it('generates valid CSV report with all columns', async () => {
      vi.spyOn(prisma.payment, 'findMany').mockResolvedValue([]);
      const report = await reconciliationService.runReconciliation();
      const csv = reconciliationService.generateCsvReport(report);

      expect(csv).toContain('Gateway Payment ID');
      expect(csv).toContain('Discrepancy Type');
      expect(csv).toContain('Variance (INR)');
    });

    it('performs one-click re-sync to repair status mismatch', async () => {
      const mockExistingPayment = {
        id: 'db_pay_resync_1',
        depositId: 'dep_101',
        amount: 4000000n,
        status: PaymentStatus.CREATED,
        gatewayPaymentId: 'pay_rzp_mock_live_101',
        deposit: { id: 'dep_101', amountDue: 4000000n, amountPaid: 0n },
        user: { name: 'Test User' },
        receipt: null,
      };

      vi.spyOn(prisma.payment, 'findFirst').mockResolvedValue(mockExistingPayment as any);
      vi.spyOn(prisma.deposit, 'update').mockResolvedValue({} as any);
      vi.spyOn(prisma.payment, 'update').mockResolvedValue({} as any);
      vi.spyOn(prisma.receipt, 'count').mockResolvedValue(42);
      vi.spyOn(prisma.receipt, 'create').mockResolvedValue({
        receiptNumber: 'REC-202611-20042',
      } as any);
      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

      const resyncResult = await reconciliationService.resyncTransaction(
        'pay_rzp_mock_live_101',
        mockAdminAuth,
      );

      expect(resyncResult.success).toBe(true);
      expect(resyncResult.action).toBe('PAYMENT_CAPTURED_AND_SETTLED');
      expect(resyncResult.receiptNumber).toBe('REC-202611-20042');
    });
  });
});

