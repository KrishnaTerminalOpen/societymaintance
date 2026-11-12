import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma, RefundStatus, AuditAction } from '@colony/database';
import { CreateRefundSchema, rupeesToPaise } from '@colony/shared/edge';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const refunds = await prisma.refund.findMany({
      where: {
        payment: {
          userId: session.sub,
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        payment: {
          select: {
            id: true,
            amount: true,
            method: true,
            gatewayPaymentId: true,
            createdAt: true,
            deposit: {
              select: {
                title: true,
              },
            },
          },
        },
      },
    });

    // Also get eligible payments that can be refunded (status = SUCCESS)
    const eligiblePayments = await prisma.payment.findMany({
      where: {
        userId: session.sub,
        status: 'SUCCESS',
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        amount: true,
        method: true,
        createdAt: true,
        deposit: {
          select: {
            title: true,
          },
        },
      },
    });

    return NextResponse.json({
      refunds: refunds.map((r) => ({
        id: r.id,
        paymentId: r.paymentId,
        amountPaise: r.amount.toString(),
        reason: r.reason,
        status: r.status,
        gatewayRefundId: r.gatewayRefundId,
        createdAt: r.createdAt.toISOString(),
        paymentAmountPaise: r.payment.amount.toString(),
        paymentMethod: r.payment.method,
        depositTitle: r.payment.deposit.title,
      })),
      eligiblePayments: eligiblePayments.map((p) => ({
        id: p.id,
        amountPaise: p.amount.toString(),
        method: p.method,
        createdAt: p.createdAt.toISOString(),
        depositTitle: p.deposit.title,
      })),
    });
  } catch (error) {
    console.error('Error fetching refunds:', error);
    return NextResponse.json({ error: 'Failed to fetch refunds' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const parseResult = CreateRefundSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input. Please check the refund amount and reason.' },
        { status: 400 },
      );
    }

    const { paymentId, amount, reason } = parseResult.data;

    // Verify payment belongs to resident and is SUCCESS
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment || payment.userId !== session.sub) {
      return NextResponse.json(
        { error: 'Payment not found or does not belong to your account.' },
        { status: 404 },
      );
    }

    if (payment.status !== 'SUCCESS') {
      return NextResponse.json(
        { error: 'Only successfully completed payments can be refunded.' },
        { status: 400 },
      );
    }

    const refundAmountPaise = BigInt(amount);
    if (refundAmountPaise <= 0n || refundAmountPaise > BigInt(payment.amount)) {
      return NextResponse.json(
        { error: 'Refund amount cannot exceed the original paid amount.' },
        { status: 400 },
      );
    }

    // Check existing refunds for this payment
    const existingRefunds = await prisma.refund.findMany({
      where: { paymentId },
    });
    const totalRefundedSoFar = existingRefunds.reduce(
      (sum, r) => sum + BigInt(r.amount),
      0n,
    );

    if (totalRefundedSoFar + refundAmountPaise > BigInt(payment.amount)) {
      return NextResponse.json(
        { error: 'Cumulative refund amount exceeds original transaction total.' },
        { status: 400 },
      );
    }

    // Create refund record with status PENDING
    const refund = await prisma.refund.create({
      data: {
        paymentId,
        amount: refundAmountPaise,
        reason,
        status: RefundStatus.PENDING,
      },
    });

    // Write audit log
    await prisma.auditLog.create({
      data: {
        actorId: session.sub,
        actorPhone: session.phone,
        action: AuditAction.REFUND_REQUESTED,
        entity: 'Refund',
        entityId: refund.id,
        before: undefined,
        after: {
          paymentId,
          refundAmountPaise: refundAmountPaise.toString(),
          reason,
          status: RefundStatus.PENDING,
        },
        ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
        userAgent: req.headers.get('user-agent') || 'Unknown',
      },
    });

    // Create a notification for the resident
    await prisma.notification.create({
      data: {
        userId: session.sub,
        title: 'Refund Request Submitted',
        message: `Your refund request for ₹${(Number(refundAmountPaise) / 100).toLocaleString('en-IN')} has been submitted to the management committee for review.`,
        type: 'REFUND_PROCESSED',
        channel: 'IN_APP',
        status: 'SENT',
      },
    });

    return NextResponse.json({
      success: true,
      refund: {
        id: refund.id,
        amountPaise: refund.amount.toString(),
        status: refund.status,
        reason: refund.reason,
        createdAt: refund.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error creating refund request:', error);
    return NextResponse.json({ error: 'Failed to submit refund request' }, { status: 500 });
  }
}

