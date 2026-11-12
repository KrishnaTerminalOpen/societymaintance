import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@colony/database';
import { NotificationsService } from '../src/notifications/notifications.service';
import {
  ISmsProvider,
  IEmailProvider,
  IWhatsAppProvider,
} from '../src/notifications/interfaces/notification.interface';
import { DeadLetterQueueService } from '../src/notifications/dlq.service';

describe('Module 6: Notifications & DLQ Tests', () => {
  let notificationsService: NotificationsService;
  let mockSms: ISmsProvider;
  let mockEmail: IEmailProvider;
  let mockWhatsApp: IWhatsAppProvider;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockSms = {
      name: 'MockSMS',
      sendSms: vi.fn().mockResolvedValue({ success: true, messageId: 'sms_123' }),
    };
    mockEmail = {
      name: 'MockEmail',
      sendEmail: vi.fn().mockResolvedValue({ success: true, messageId: 'email_456' }),
    };
    mockWhatsApp = {
      name: 'MockWhatsApp',
      sendWhatsApp: vi.fn().mockResolvedValue({ success: true, messageId: 'wa_789' }),
    };

    notificationsService = new NotificationsService(mockSms, mockEmail, mockWhatsApp);
  });

  describe('Message Formatting Engine', () => {
    it('formats OTP notification message correctly', () => {
      const msg = notificationsService.buildMessage('OTP', {
        colonyName: 'Gokuldham RWA',
        otp: '482910',
      });
      expect(msg.title).toBe('Your Verification Code');
      expect(msg.text).toContain('482910');
      expect(msg.text).toContain('Gokuldham RWA');
      expect(msg.html).toContain('482910');
    });

    it('formats PAYMENT_SUCCESS with amount in INR and receipt download link', () => {
      const msg = notificationsService.buildMessage('PAYMENT_SUCCESS', {
        colonyName: 'Gokuldham RWA',
        amountPaise: 2500000n, // ₹25,000
        receiptNumber: 'REC-202611-001',
        pdfUrl: 'https://cdn.example.com/receipt.pdf',
        unit: 'Block A-101',
      });
      expect(msg.title).toBe('Deposit Payment Successful');
      expect(msg.text).toContain('₹25,000');
      expect(msg.text).toContain('REC-202611-001');
      expect(msg.text).toContain('https://cdn.example.com/receipt.pdf');
    });

    it('formats PAYMENT_FAILED with retry instructions', () => {
      const msg = notificationsService.buildMessage('PAYMENT_FAILED', {
        colonyName: 'Gokuldham RWA',
        amountPaise: 1000000n,
        unit: 'Block B-204',
        reason: 'Card expired or declined by issuing bank',
      });
      expect(msg.title).toBe('Payment Failed or Incomplete');
      expect(msg.text).toContain('Card expired or declined');
    });

    it('formats PAYMENT_DUE reminder', () => {
      const msg = notificationsService.buildMessage('PAYMENT_DUE', {
        colonyName: 'Gokuldham RWA',
        amountPaise: 2500000n,
        unit: 'Block C-301',
        dueDate: new Date('2026-11-30').toISOString(),
      });
      expect(msg.title).toContain('Due Date Reminder');
      expect(msg.text).toContain('₹25,000');
    });

    it('formats PAYMENT_OVERDUE with urgent warning and late fee', () => {
      const msg = notificationsService.buildMessage('PAYMENT_OVERDUE', {
        colonyName: 'Gokuldham RWA',
        amountPaise: 3000000n,
        lateFeePaise: 50000n,
        unit: 'Block D-401',
      });
      expect(msg.title).toContain('URGENT: Security Deposit Overdue');
      expect(msg.text).toContain('₹30,000');
      expect(msg.text).toContain('₹500');
    });

    it('formats REFUND_PROCESSED confirmation', () => {
      const msg = notificationsService.buildMessage('REFUND_PROCESSED', {
        colonyName: 'Gokuldham RWA',
        amountPaise: 500000n,
        unit: 'Block A-102',
        gatewayRefundId: 'rfnd_razorpay_9988',
      });
      expect(msg.title).toBe('Deposit Refund Processed');
      expect(msg.text).toContain('rfnd_razorpay_9988');
      expect(msg.text).toContain('₹5,000');
    });
  });

  describe('Provider Resilience & Payment Isolation Guarantee', () => {
    it('does not throw uncaught errors when SMS or Email provider is down', async () => {
      // Mock existing user
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'user_mock_1',
        name: 'Priya Sharma',
        phone: '+919811122233',
        email: 'priya@example.com',
        role: 'RESIDENT',
        status: 'ACTIVE',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        houses: [{ id: 'house_1', block: 'A', houseNumber: '101' }],
      } as any);

      vi.spyOn(prisma.notification, 'create').mockResolvedValue({} as any);

      // Simulate SMS and Email provider outages
      mockSms.sendSms = vi.fn().mockRejectedValue(new Error('SMS Gateway 503 Service Unavailable'));
      mockEmail.sendEmail = vi.fn().mockRejectedValue(new Error('SMTP Connection Timeout'));
      mockWhatsApp.sendWhatsApp = vi.fn().mockRejectedValue(new Error('WhatsApp Webhook Timeout'));

      // If notification dispatch is called, it catches errors internally
      const result = await notificationsService.dispatch({
        userId: 'user_mock_1',
        type: 'PAYMENT_SUCCESS',
        channel: 'ALL',
        metadata: { amountPaise: 100000n },
      });

      // Returns graceful results without crashing the payment transaction
      expect(result.success).toBe(false);
      expect(result.results.length).toBe(3);
      expect(result.results[0].error).toContain('SMS Gateway 503');
    });
  });

  describe('Dead Letter Queue (DLQ)', () => {
    let dlqService: DeadLetterQueueService;
    let mockReceiptsQueue: any;
    let mockNotificationsQueue: any;
    let mockRemindersQueue: any;

    beforeEach(() => {
      mockReceiptsQueue = { add: vi.fn().mockResolvedValue({ id: 'requeued_receipt' }) };
      mockNotificationsQueue = { add: vi.fn().mockResolvedValue({ id: 'requeued_notif' }) };
      mockRemindersQueue = { add: vi.fn().mockResolvedValue({ id: 'requeued_reminder' }) };

      dlqService = new DeadLetterQueueService(
        mockReceiptsQueue,
        mockNotificationsQueue,
        mockRemindersQueue,
      );
    });

    it('records failed jobs after exhausting attempts and lists them', async () => {
      const failedJob = {
        id: 'job_443',
        queueName: 'notifications-queue',
        name: 'dispatch-notification',
        data: { userId: 'user_1', type: 'PAYMENT_SUCCESS' },
        attemptsMade: 5,
      };

      const record = await dlqService.recordFailedJob(
        failedJob,
        new Error('External SMS provider unreachable after 5 attempts'),
      );

      expect(record.id).toBeDefined();
      expect(record.failedReason).toContain('External SMS provider unreachable');

      const failedList = await dlqService.getFailedJobs();
      expect(failedList.length).toBe(1);
      expect(failedList[0].jobName).toBe('dispatch-notification');
      expect(failedList[0].queueName).toBe('notifications-queue');
    });

    it('allows admin to retry a failed job from the Dead Letter Queue', async () => {
      const failedJob = {
        id: 'job_882',
        queueName: 'receipts-queue',
        name: 'generate-receipt',
        data: { paymentId: 'payment_123' },
        attemptsMade: 5,
      };

      const record = await dlqService.recordFailedJob(failedJob, new Error('R2 S3 connection timeout'));
      expect((await dlqService.getFailedJobs()).length).toBe(1);

      const retryResult = await dlqService.retryFailedJob(record.id);
      expect(retryResult.success).toBe(true);
      expect(mockReceiptsQueue.add).toHaveBeenCalledWith(
        'generate-receipt',
        { paymentId: 'payment_123' },
        expect.any(Object),
      );

      // Record should be removed from DLQ after successful re-queue
      expect((await dlqService.getFailedJobs()).length).toBe(0);
    });
  });
});
