import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma, PaymentStatus, DepositStatus, AuditAction, NotificationStatus } from '@colony/database';
import { formatPaiseToINR } from '@colony/shared/edge';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authUser = await requireAuth(req, ['ADMIN', 'SUPER_ADMIN']);
    const { id: refundId } = await params;
    const body = await req.json();

    const { action, reason, approvedAmountPaise } = body;

    if (!action || (action !== 'APPROVE' && action !== 'REJECT')) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'APPROVE' or 'REJECT'." },
        { status: 400 },
      );
    }

    // Database transaction with double-refund and over-refund guards
    const result = await prisma.$transaction(async (tx) => {
      const refund = await tx.refund.findUnique({
        where: { id: refundId },
        include: {
          payment: {
            include: {
              deposit: {
                include: { house: true },
              },
              user: true,
            },
          },
        },
      });

      if (!refund) {
        throw new Error('Refund request not found');
      }

      if (refund.status !== 'PENDING') {
        throw new Error(`Refund request has already been processed (status: ${refund.status})`);
      }

      const payment = refund.payment;
      if (
        payment.status !== PaymentStatus.SUCCESS &&
        payment.status !== PaymentStatus.PARTIALLY_REFUNDED
      ) {
        throw new Error(`Underlying payment is not eligible for refund (status: ${payment.status})`);
      }

      // Rejection Branch
      if (action === 'REJECT') {
        const rejectionNote = reason || 'Refund request rejected by committee admin';
        const updated = await tx.refund.update({
          where: { id: refund.id },
          data: {
            status: 'FAILED',
            reason: `${refund.reason} [Rejected: ${rejectionNote}]`,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: authUser.sub,
            actorPhone: authUser.phone,
            action: AuditAction.UPDATE,
            entity: 'Refund',
            entityId: refund.id,
            before: { status: 'PENDING', amountPaise: refund.amount.toString() },
            after: { status: 'FAILED', rejectionReason: rejectionNote },
          },
        });

        // Notify resident
        await tx.notification.create({
          data: {
            userId: payment.userId,
            title: 'Refund Request Update',
            message: `Your deposit refund request of ${formatPaiseToINR(refund.amount)} was rejected. Reason: ${rejectionNote}`,
            type: 'SYSTEM_ALERT',
            channel: 'SMS',
            status: NotificationStatus.SENT,
          },
        });

        return {
          success: true,
          status: 'REJECTED',
          message: 'Refund request was rejected successfully.',
        };
      }

      // Approval Branch
      const amountToRefund = approvedAmountPaise ? BigInt(approvedAmountPaise) : refund.amount;

      if (amountToRefund <= 0n) {
        throw new Error('Refund amount must be greater than zero');
      }

      // Fetch all previously settled refunds for this payment
      const priorRefunds = await tx.refund.findMany({
        where: {
          paymentId: payment.id,
          status: 'PROCESSED',
          id: { not: refund.id },
        },
      });

      const alreadyRefunded = priorRefunds.reduce((sum, r) => sum + r.amount, 0n);

      if (alreadyRefunded + amountToRefund > payment.amount) {
        throw new Error(
          `Cannot refund ${formatPaiseToINR(amountToRefund)}. Cumulative refunds (${formatPaiseToINR(alreadyRefunded + amountToRefund)}) would exceed original paid amount ${formatPaiseToINR(payment.amount)}.`,
        );
      }

      // Gateway Refund (deterministic mock / simulated ID in dev)
      const gatewayRefundId = `rfnd_rzp_${Date.now()}`;

      // Update Refund
      await tx.refund.update({
        where: { id: refund.id },
        data: {
          status: 'PROCESSED',
          amount: amountToRefund,
          gatewayRefundId,
        },
      });

      // Update Payment status
      const isFullRefund = alreadyRefunded + amountToRefund >= payment.amount;
      const newPaymentStatus = isFullRefund ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED;

      await tx.payment.update({
        where: { id: payment.id },
        data: { status: newPaymentStatus },
      });

      // Update Deposit amountPaid and status
      const currentPaid = payment.deposit.amountPaid;
      const newDepositPaid = currentPaid > amountToRefund ? currentPaid - amountToRefund : 0n;
      const newDepositStatus =
        newDepositPaid === 0n
          ? DepositStatus.PENDING
          : newDepositPaid < payment.deposit.amountDue
          ? DepositStatus.PARTIAL
          : DepositStatus.PAID;

      await tx.deposit.update({
        where: { id: payment.depositId },
        data: {
          amountPaid: newDepositPaid,
          status: newDepositStatus,
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          actorId: authUser.sub,
          actorPhone: authUser.phone,
          action: AuditAction.REFUND_COMPLETED,
          entity: 'Refund',
          entityId: refund.id,
          before: {
            paymentStatus: payment.status,
            depositAmountPaid: currentPaid.toString(),
            refundStatus: 'PENDING',
          },
          after: {
            paymentStatus: newPaymentStatus,
            depositAmountPaid: newDepositPaid.toString(),
            refundStatus: 'PROCESSED',
            refundAmountPaise: amountToRefund.toString(),
            gatewayRefundId,
          },
        },
      });

      // Resident Notification
      await tx.notification.create({
        data: {
          userId: payment.userId,
          title: 'Deposit Refund Processed',
          message: `Your deposit refund of ${formatPaiseToINR(amountToRefund)} has been successfully approved and initiated through Razorpay. Refund ID: ${gatewayRefundId}.`,
          type: 'REFUND_PROCESSED',
          channel: 'SMS',
          status: NotificationStatus.SENT,
          metadata: {
            gatewayRefundId,
            amountPaise: Number(amountToRefund),
            unit: `Block ${payment.deposit.house?.block || ''}-${payment.deposit.house?.houseNumber || ''}`,
          },
        },
      });

      return {
        success: true,
        status: 'PROCESSED',
        gatewayRefundId,
        refundedAmountPaise: amountToRefund.toString(),
        newPaymentStatus,
        newDepositPaidPaise: newDepositPaid.toString(),
        message: `Refund of ${formatPaiseToINR(amountToRefund)} was approved and processed successfully.`,
      };
    });

    return NextResponse.json(result);
  } catch (err: any) {
    if (err.message?.includes('Unauthorized') || err.message?.includes('Forbidden')) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: err.message || 'Refund review failed' }, { status: 400 });
  }
}

