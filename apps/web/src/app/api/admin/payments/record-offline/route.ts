import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma, PaymentStatus, DepositStatus, PaymentMethod, AuditAction } from '@colony/database';
import { RecordOfflinePaymentSchema, formatPaiseToINR } from '@colony/shared/edge';
import { invalidateDashboardCaches } from '@colony/shared';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['ADMIN', 'SUPER_ADMIN']);
    const body = await req.json();

    const parseResult = RecordOfflinePaymentSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input. Please provide valid deposit, resident, method, and notes.' },
        { status: 400 },
      );
    }

    const { depositId, userId, amount, method, offlineNotes, idempotencyKey } = parseResult.data;
    const paymentAmountPaise = BigInt(amount);

    if (paymentAmountPaise <= 0n) {
      return NextResponse.json({ error: 'Payment amount must be greater than zero.' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch deposit
      const deposit = await tx.deposit.findUnique({
        where: { id: depositId },
        include: { house: true },
      });

      if (!deposit) {
        throw new Error('Deposit record not found');
      }

      const due = BigInt(deposit.amountDue);
      const paid = BigInt(deposit.amountPaid);
      const remainingBalance = due - paid;

      if (remainingBalance <= 0n) {
        throw new Error('This deposit is already fully paid. Cannot accept additional offline funds.');
      }

      if (paymentAmountPaise > remainingBalance) {
        throw new Error(
          `Offline payment amount ${formatPaiseToINR(paymentAmountPaise)} exceeds remaining balance ${formatPaiseToINR(remainingBalance)}.`,
        );
      }

      // Check for double submission via idempotency key
      const existing = await tx.payment.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        throw new Error('This offline payment has already been recorded (idempotency key matched).');
      }

      // 2. Create Payment record
      const payment = await tx.payment.create({
        data: {
          depositId: deposit.id,
          userId,
          amount: paymentAmountPaise,
          method: method as PaymentMethod,
          status: PaymentStatus.SUCCESS,
          idempotencyKey,
          isOffline: true,
          offlineNotes,
          offlineVerifiedBy: auth.sub,
          offlineVerifiedAt: new Date(),
        },
      });

      // 3. Update Deposit balance & status
      const newPaid = paid + paymentAmountPaise;
      const newStatus = newPaid >= due ? DepositStatus.PAID : DepositStatus.PARTIAL;

      await tx.deposit.update({
        where: { id: deposit.id },
        data: {
          amountPaid: newPaid,
          status: newStatus,
        },
      });

      // 4. Generate sequential receipt number
      const receiptCount = await tx.receipt.count();
      const receiptNumber = `REC-2026-${(1001 + receiptCount).toString()}`;
      const pdfUrl = `https://cdn.colonydeposit.example.com/receipts/${receiptNumber}.pdf`;

      const receipt = await tx.receipt.create({
        data: {
          paymentId: payment.id,
          receiptNumber,
          pdfUrl,
        },
      });

      // 5. Audit Log (Cardinal Rule: Every financial action is written to an audit log)
      await tx.auditLog.create({
        data: {
          actorId: auth.sub,
          actorPhone: auth.phone,
          action: AuditAction.OFFLINE_PAYMENT_RECORDED,
          entity: 'Payment',
          entityId: payment.id,
          before: {
            depositStatus: deposit.status,
            amountPaid: paid.toString(),
          },
          after: {
            depositStatus: newStatus,
            amountPaid: newPaid.toString(),
            recordedAmount: paymentAmountPaise.toString(),
            method,
            offlineNotes,
            verifiedByAdmin: auth.sub,
            receiptNumber,
          },
          ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
          userAgent: req.headers.get('user-agent') || 'AdminConsole',
        },
      });

      return {
        paymentId: payment.id,
        receiptNumber: receipt.receiptNumber,
        newBalance: (due - newPaid).toString(),
        depositStatus: newStatus,
      };
    });

    await invalidateDashboardCaches(userId);

    return NextResponse.json({
      success: true,
      message: 'Offline payment recorded and receipt generated successfully.',
      ...result,
    });
  } catch (error: any) {
    console.error('Error recording offline payment:', error);
    return NextResponse.json({ error: error.message || 'Failed to record offline payment' }, { status: 400 });
  }
}

