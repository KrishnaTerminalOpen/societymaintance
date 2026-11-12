import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@colony/database';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payments = await prisma.payment.findMany({
      where: {
        userId: session.sub,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        receipt: true,
        refunds: true,
        deposit: {
          select: {
            title: true,
            house: {
              select: {
                block: true,
                houseNumber: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      payments: payments.map((p) => ({
        id: p.id,
        amountPaise: p.amount.toString(),
        method: p.method,
        status: p.status,
        isOffline: p.isOffline,
        gatewayOrderId: p.gatewayOrderId,
        gatewayPaymentId: p.gatewayPaymentId,
        createdAt: p.createdAt.toISOString(),
        depositTitle: p.deposit.title,
        houseLabel: `Flat ${p.deposit.house.block}-${p.deposit.house.houseNumber}`,
        receipt: p.receipt
          ? {
              id: p.receipt.id,
              receiptNumber: p.receipt.receiptNumber,
              pdfUrl: p.receipt.pdfUrl,
              generatedAt: p.receipt.generatedAt.toISOString(),
            }
          : null,
        refunds: p.refunds.map((r) => ({
          id: r.id,
          amountPaise: r.amount.toString(),
          reason: r.reason,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        })),
      })),
    });
  } catch (error) {
    console.error('Error in /api/resident/payments:', error);
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 });
  }
}

