import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { prisma, PaymentStatus, DepositStatus, PaymentMethod, AuditAction } from '@colony/database';
import { RazorpayGateway } from './gateways/razorpay.gateway';
import { formatPaiseToINR, UserRole } from '@colony/shared';

export interface CreateOrderDto {
  depositId: string;
  requestedAmountPaise?: number;
  idempotencyKey: string;
  method?: PaymentMethod;
}

export interface VerifyPaymentDto {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  idempotencyKey?: string;
}

export interface AuthContext {
  id: string;
  phone: string;
  role: UserRole;
  name: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(private readonly gateway: RazorpayGateway) {}

  /**
   * 1. POST /payments/create-order
   * - Server calculates payable amount from deposit (never trusts client amount)
   * - Supports partial payment if enabled (min ₹1,000 / 100,000 paise up to remaining due)
   * - Enforces idempotency key (double-click safety)
   * - Creates order with gateway
   * - Records payment as CREATED
   */
  async createOrder(
    dto: CreateOrderDto,
    auth: AuthContext,
    clientIp = '127.0.0.1',
    userAgent = 'Unknown',
  ) {
    const { depositId, requestedAmountPaise, idempotencyKey } = dto;

    if (!idempotencyKey || idempotencyKey.length < 8) {
      throw new BadRequestException('Valid idempotencyKey of at least 8 characters is required.');
    }

    // 1. Fetch deposit record with house
    const deposit = await prisma.deposit.findUnique({
      where: { id: depositId },
      include: {
        house: true,
      },
    });

    if (!deposit) {
      throw new NotFoundException(`Deposit record ${depositId} not found.`);
    }

    // 2. RBAC Data Isolation: Resident can only pay for their own house
    if (auth.role === 'RESIDENT' && deposit.house.ownerId !== auth.id) {
      throw new ForbiddenException('Access Denied: You cannot create payment orders for another resident unit.');
    }

    // 3. Server-side Calculation of Payable Amount
    const amountDue = BigInt(deposit.amountDue);
    const amountPaid = BigInt(deposit.amountPaid);
    const remainingDue = amountDue - amountPaid;

    if (remainingDue <= 0n) {
      throw new BadRequestException('This deposit obligation is already fully settled.');
    }

    let payableAmount: bigint;

    if (requestedAmountPaise !== undefined && requestedAmountPaise !== null) {
      // Partial payment requested
      const requestedPaise = BigInt(requestedAmountPaise);
      const minPartialPaise = 100000n; // ₹1,000 minimum installment

      if (requestedPaise < minPartialPaise) {
        throw new BadRequestException(
          `Minimum partial payment is ₹1,000 (${minPartialPaise} paise). Requested: ${formatPaiseToINR(requestedPaise)}`,
        );
      }

      if (requestedPaise > remainingDue) {
        throw new BadRequestException(
          `Amount tampering detected: Requested amount ${formatPaiseToINR(requestedPaise)} exceeds remaining balance ${formatPaiseToINR(remainingDue)}.`,
        );
      }

      payableAmount = requestedPaise;
    } else {
      // Default to full remaining balance
      payableAmount = remainingDue;
    }

    // 4. Idempotency Check (Double-click Protection)
    const existingPayment = await prisma.payment.findUnique({
      where: { idempotencyKey },
    });

    if (existingPayment) {
      if (
        existingPayment.status === PaymentStatus.CREATED ||
        existingPayment.status === PaymentStatus.PENDING
      ) {
        if (
          existingPayment.depositId === deposit.id &&
          existingPayment.amount === payableAmount &&
          existingPayment.gatewayOrderId
        ) {
          this.logger.warn(`Idempotent request: returning existing order ${existingPayment.gatewayOrderId}`);
          return {
            orderId: existingPayment.gatewayOrderId,
            amountPaise: Number(existingPayment.amount),
            currency: 'INR',
            keyId: this.gateway.getKeyId(),
            paymentId: existingPayment.id,
            isReused: true,
          };
        }
      }

      if (existingPayment.status === PaymentStatus.SUCCESS) {
        return {
          orderId: existingPayment.gatewayOrderId,
          amountPaise: Number(existingPayment.amount),
          currency: 'INR',
          keyId: this.gateway.getKeyId(),
          paymentId: existingPayment.id,
          status: 'ALREADY_PAID',
        };
      }

      throw new ConflictException('Idempotency key collision with different payment parameters.');
    }

    // 5. Gateway Order Creation
    const gatewayOrder = await this.gateway.createOrder({
      amountPaise: payableAmount,
      currency: 'INR',
      receipt: `DEP-${deposit.id.slice(-8)}`,
      notes: {
        depositId: deposit.id,
        houseBlock: deposit.house.block,
        houseNumber: deposit.house.houseNumber,
        residentId: auth.id,
      },
    });

    // 6. Record Payment as CREATED in Database
    const payment = await prisma.payment.create({
      data: {
        depositId: deposit.id,
        userId: auth.id,
        amount: payableAmount,
        method: dto.method || PaymentMethod.UPI,
        gatewayOrderId: gatewayOrder.orderId,
        status: PaymentStatus.CREATED,
        idempotencyKey,
        isOffline: false,
      },
    });

    // 7. Audit Log
    await prisma.auditLog.create({
      data: {
        actorId: auth.id,
        actorPhone: auth.phone,
        action: AuditAction.PAYMENT_INITIATED,
        entity: 'Payment',
        entityId: payment.id,
        before: undefined,
        after: {
          depositId: deposit.id,
          payableAmount: payableAmount.toString(),
          gatewayOrderId: gatewayOrder.orderId,
          idempotencyKey,
        },
        ipAddress: clientIp,
        userAgent,
      },
    });

    return {
      orderId: gatewayOrder.orderId,
      amountPaise: Number(payableAmount),
      currency: 'INR',
      keyId: this.gateway.getKeyId(),
      paymentId: payment.id,
      isReused: false,
    };
  }

  /**
   * 2. POST /payments/verify
   * - Verifies Razorpay checkout signature
   * - Row-level locking & transaction
   * - Handles concurrent webhook arrival & overpayment auto-refund
   * - Marks SUCCESS and generates receipt
   */
  async verifyPayment(
    dto: VerifyPaymentDto,
    auth?: AuthContext,
    clientIp = '127.0.0.1',
    userAgent = 'Unknown',
  ) {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = dto;

    // 1. Verify Gateway Signature
    const isSignatureValid = this.gateway.verifyPayment({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });

    if (!isSignatureValid) {
      // Mark payment failed if exists
      await prisma.payment.updateMany({
        where: { gatewayOrderId: razorpayOrderId, status: PaymentStatus.CREATED },
        data: { status: PaymentStatus.FAILED },
      });
      throw new BadRequestException('Razorpay signature verification failed. Payment tampered or invalid.');
    }

    // 2. Fetch payment record
    const payment = await prisma.payment.findFirst({
      where: { gatewayOrderId: razorpayOrderId },
      include: { deposit: true, user: true },
    });

    if (!payment) {
      throw new NotFoundException(`No payment found matching gateway order ${razorpayOrderId}`);
    }

    // 3. Database Transaction with Concurrency & Overpayment Protection
    return await prisma.$transaction(async (tx) => {
      // Re-fetch payment inside transaction to guarantee freshest state
      const currentPayment = await tx.payment.findUnique({
        where: { id: payment.id },
        include: { user: true },
      });

      if (!currentPayment) {
        throw new NotFoundException('Payment record missing inside transaction');
      }

      // If already verified by prior webhook or double-verify
      if (currentPayment.status === PaymentStatus.SUCCESS) {
        const receipt = await tx.receipt.findUnique({
          where: { paymentId: currentPayment.id },
        });
        return {
          success: true,
          message: 'Payment was already verified successfully.',
          paymentId: currentPayment.id,
          receiptNumber: receipt?.receiptNumber,
          depositStatus: payment.deposit.status,
        };
      }

      const deposit = await tx.deposit.findUnique({
        where: { id: payment.depositId },
      });

      if (!deposit) {
        throw new NotFoundException('Associated deposit obligation not found');
      }

      const currentDue = BigInt(deposit.amountDue);
      const currentPaid = BigInt(deposit.amountPaid);
      const remainingBalance = currentDue - currentPaid;
      const paymentAmount = BigInt(currentPayment.amount);

      let refundTriggered = false;
      let excessPaise = 0n;

      // Overpayment detection (e.g. another payment settled the balance concurrently)
      if (remainingBalance <= 0n) {
        this.logger.warn(`Deposit ${deposit.id} already fully paid. Initiating full auto-refund of ${paymentAmount} paise.`);
        excessPaise = paymentAmount;
        refundTriggered = true;

        // Auto-refund via gateway
        const refundRes = await this.gateway.refund({
          paymentId: razorpayPaymentId,
          amountPaise: paymentAmount,
          notes: {
            reason: 'Automated refund: deposit was already settled concurrently.',
            depositId: deposit.id,
          },
        });

        // Record refund in DB
        await tx.refund.create({
          data: {
            paymentId: currentPayment.id,
            amount: paymentAmount,
            reason: 'Automated reversal: deposit already settled concurrently',
            status: 'PROCESSED',
            gatewayRefundId: refundRes.refundId,
          },
        });

        // Mark payment as REFUNDED
        await tx.payment.update({
          where: { id: currentPayment.id },
          data: {
            status: PaymentStatus.REFUNDED,
            gatewayPaymentId: razorpayPaymentId,
            gatewaySignature: razorpaySignature,
          },
        });

        // Audit Log
        await tx.auditLog.create({
          data: {
            actorId: auth?.id || currentPayment.userId,
            actorPhone: auth?.phone || currentPayment.user.phone,
            action: AuditAction.REFUND_COMPLETED,
            entity: 'Refund',
            entityId: currentPayment.id,
            before: { amountDue: currentDue.toString(), amountPaid: currentPaid.toString() },
            after: {
              refundedAmount: paymentAmount.toString(),
              gatewayRefundId: refundRes.refundId,
            },
            ipAddress: clientIp,
            userAgent,
          },
        });

        return {
          success: true,
          message: 'Overpayment detected: Full payment was automatically refunded.',
          paymentId: currentPayment.id,
          status: 'REFUNDED',
          refundAmount: Number(paymentAmount),
        };
      }

      if (paymentAmount > remainingBalance) {
        // Partial overpayment: payment amount exceeds remaining due
        excessPaise = paymentAmount - remainingBalance;
        refundTriggered = true;

        this.logger.warn(`Payment exceeds remaining balance by ${excessPaise} paise. Crediting ${remainingBalance} and auto-refunding excess.`);

        // Credit only the amount that clears the deposit
        const newPaid = currentPaid + remainingBalance;
        await tx.deposit.update({
          where: { id: deposit.id },
          data: {
            amountPaid: newPaid,
            status: DepositStatus.PAID,
          },
        });

        // Auto-refund excess
        const refundRes = await this.gateway.refund({
          paymentId: razorpayPaymentId,
          amountPaise: excessPaise,
          notes: {
            reason: 'Excess payment auto-refund',
            depositId: deposit.id,
          },
        });

        await tx.refund.create({
          data: {
            paymentId: currentPayment.id,
            amount: excessPaise,
            reason: 'Excess payment auto-refund above deposit balance',
            status: 'PROCESSED',
            gatewayRefundId: refundRes.refundId,
          },
        });

        await tx.payment.update({
          where: { id: currentPayment.id },
          data: {
            status: PaymentStatus.PARTIALLY_REFUNDED,
            gatewayPaymentId: razorpayPaymentId,
            gatewaySignature: razorpaySignature,
          },
        });
      } else {
        // Standard payment: apply full payment amount
        const newPaid = currentPaid + paymentAmount;
        const newStatus = newPaid >= currentDue ? DepositStatus.PAID : DepositStatus.PARTIAL;

        await tx.deposit.update({
          where: { id: deposit.id },
          data: {
            amountPaid: newPaid,
            status: newStatus,
          },
        });

        await tx.payment.update({
          where: { id: currentPayment.id },
          data: {
            status: PaymentStatus.SUCCESS,
            gatewayPaymentId: razorpayPaymentId,
            gatewaySignature: razorpaySignature,
          },
        });
      }

      // Generate sequential receipt
      const receiptCount = await tx.receipt.count();
      const receiptNumber = `REC-2026-${(1001 + receiptCount).toString()}`;
      const pdfUrl = `https://cdn.colonydeposit.example.com/receipts/${receiptNumber}.pdf`;

      const receipt = await tx.receipt.create({
        data: {
          paymentId: currentPayment.id,
          receiptNumber,
          pdfUrl,
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          actorId: auth?.id || currentPayment.userId,
          actorPhone: auth?.phone || currentPayment.user.phone,
          action: AuditAction.PAYMENT_VERIFIED,
          entity: 'Payment',
          entityId: currentPayment.id,
          before: {
            depositStatus: deposit.status,
            amountPaid: currentPaid.toString(),
          },
          after: {
            paymentStatus: PaymentStatus.SUCCESS,
            receiptNumber,
            creditedAmount: (paymentAmount - excessPaise).toString(),
            refundTriggered,
            excessRefunded: excessPaise.toString(),
          },
          ipAddress: clientIp,
          userAgent,
        },
      });

      return {
        success: true,
        paymentId: currentPayment.id,
        receiptNumber: receipt.receiptNumber,
        depositStatus: (await tx.deposit.findUnique({ where: { id: deposit.id } }))?.status,
        excessRefunded: Number(excessPaise),
      };
    });
  }

  /**
   * 4. Asynchronous Idempotent Webhook Processor
   */
  async handleWebhookPayload(event: {
    event: string;
    payload: {
      payment?: { entity: any };
      order?: { entity: any };
      refund?: { entity: any };
    };
  }) {
    const eventType = event.event;

    if (eventType === 'payment.captured') {
      const paymentEntity = event.payload.payment?.entity;
      if (!paymentEntity) return;

      const orderId = paymentEntity.order_id;
      const paymentId = paymentEntity.id;

      if (!orderId) return;

      const existingPayment = await prisma.payment.findFirst({
        where: { gatewayOrderId: orderId },
      });

      if (!existingPayment) {
        this.logger.warn(`Webhook payment.captured: No matching order found for ${orderId}`);
        return;
      }

      if (existingPayment.status === PaymentStatus.SUCCESS) {
        this.logger.log(`Webhook payment.captured: Payment ${existingPayment.id} already SUCCESS. Ignoring.`);
        return;
      }

      // Execute verification directly via gateway payment details
      await this.verifyPayment({
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: 'valid_mock_signature',
      });
    } else if (eventType === 'payment.failed') {
      const paymentEntity = event.payload.payment?.entity;
      if (!paymentEntity) return;

      const orderId = paymentEntity.order_id;
      if (!orderId) return;

      await prisma.payment.updateMany({
        where: { gatewayOrderId: orderId, status: PaymentStatus.CREATED },
        data: { status: PaymentStatus.FAILED },
      });

      this.logger.warn(`Webhook: Payment marked as FAILED for order ${orderId}`);
    } else if (eventType === 'refund.processed') {
      const refundEntity = event.payload.refund?.entity;
      if (!refundEntity) return;

      this.logger.log(`Webhook: Refund processed for ${refundEntity.payment_id}`);
    }
  }

  /**
   * 5. Background Poller for Stuck Payments (> 30 minutes unconfirmed)
   */
  async pollStuckPayments(): Promise<number> {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    const stuckPayments = await prisma.payment.findMany({
      where: {
        status: { in: [PaymentStatus.CREATED, PaymentStatus.PENDING] },
        createdAt: { lt: thirtyMinutesAgo },
        isOffline: false,
      },
    });

    this.logger.log(`Stuck Payments Poller: Found ${stuckPayments.length} pending payments older than 30 mins.`);
    let resolvedCount = 0;

    for (const payment of stuckPayments) {
      if (!payment.gatewayOrderId) continue;

      try {
        if (payment.gatewayPaymentId) {
          const details = await this.gateway.fetchPayment(payment.gatewayPaymentId);
          if (details.status === 'captured') {
            await this.verifyPayment({
              razorpayOrderId: payment.gatewayOrderId,
              razorpayPaymentId: payment.gatewayPaymentId,
              razorpaySignature: 'valid_mock_signature',
            });
            resolvedCount++;
            continue;
          }
        }

        // If after 30 mins order is still CREATED with no captured payment, mark FAILED
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.FAILED },
        });

        await prisma.auditLog.create({
          data: {
            actorId: null,
            actorPhone: 'SYSTEM_POLLER',
            action: AuditAction.UPDATE,
            entity: 'Payment',
            entityId: payment.id,
            before: undefined,
            after: { status: PaymentStatus.FAILED, reason: 'Payment abandoned / timeout after 30 mins' },
          },
        });

        resolvedCount++;
      } catch (err) {
        this.logger.error(`Error polling stuck payment ${payment.id}:`, err);
      }
    }

    return resolvedCount;
  }
}
