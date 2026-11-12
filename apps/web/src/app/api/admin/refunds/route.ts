import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma, RefundStatus } from '@colony/database';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req, ['ADMIN', 'SUPER_ADMIN']);

    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get('status') as RefundStatus | null;

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const refunds = await prisma.refund.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        payment: {
          include: {
            user: { select: { id: true, name: true, phone: true, email: true } },
            deposit: {
              include: {
                house: { select: { block: true, houseNumber: true, type: true } },
              },
            },
            receipt: { select: { receiptNumber: true } },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      count: refunds.length,
      data: refunds.map((r) => ({
        id: r.id,
        paymentId: r.paymentId,
        amountPaise: r.amount.toString(),
        reason: r.reason,
        status: r.status,
        gatewayRefundId: r.gatewayRefundId,
        createdAt: r.createdAt.toISOString(),
        resident: {
          id: r.payment.user.id,
          name: r.payment.user.name,
          phone: r.payment.user.phone,
          email: r.payment.user.email,
        },
        unit: `Block ${r.payment.deposit.house?.block || ''}-${r.payment.deposit.house?.houseNumber || ''}`,
        payment: {
          amountPaise: r.payment.amount.toString(),
          method: r.payment.method,
          gatewayPaymentId: r.payment.gatewayPaymentId,
          receiptNumber: r.payment.receipt?.receiptNumber,
          createdAt: r.payment.createdAt.toISOString(),
        },
      })),
    });
  } catch (err: any) {
    if (err.message?.includes('Unauthorized') || err.message?.includes('Forbidden')) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

