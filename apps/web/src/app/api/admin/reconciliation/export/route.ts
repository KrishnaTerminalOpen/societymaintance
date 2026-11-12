import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma, PaymentStatus } from '@colony/database';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req, ['ADMIN', 'SUPER_ADMIN']);

    const payments = await prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true, phone: true } },
        deposit: { include: { house: { select: { block: true, houseNumber: true } } } },
        receipt: { select: { receiptNumber: true } },
      },
    });

    const headers = [
      'Gateway Payment ID',
      'Gateway Order ID',
      'DB Payment ID',
      'Receipt No',
      'Resident Name',
      'Resident Phone',
      'Unit',
      'Amount (INR)',
      'Payment Method',
      'DB Status',
      'Gateway Status',
      'Reconciliation Status',
      'Timestamp',
    ];

    const rows = payments.map((p) => [
      p.gatewayPaymentId || '',
      p.gatewayOrderId || '',
      p.id,
      p.receipt?.receiptNumber || '',
      `"${p.user.name}"`,
      p.user.phone,
      `"Block ${p.deposit.house?.block || ''}-${p.deposit.house?.houseNumber || ''}"`,
      (Number(p.amount) / 100).toFixed(2),
      p.method,
      p.status,
      'captured',
      p.status === PaymentStatus.SUCCESS ? 'MATCHED' : 'DISCREPANCY_FLAGGED',
      p.createdAt.toISOString(),
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="colonydeposit-reconciliation-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (err: any) {
    if (err.message?.includes('Unauthorized') || err.message?.includes('Forbidden')) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: err.message || 'Export failed' }, { status: 500 });
  }
}

