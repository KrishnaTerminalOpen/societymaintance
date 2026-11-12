import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma, PaymentStatus, PaymentMethod } from '@colony/database';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req, ['ADMIN', 'SUPER_ADMIN']);

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const search = searchParams.get('search')?.trim() || '';
    const status = searchParams.get('status') as PaymentStatus | undefined;
    const block = searchParams.get('block')?.trim() || '';
    const method = searchParams.get('method') as PaymentMethod | undefined;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const order = searchParams.get('order') === 'asc' ? 'asc' : 'desc';
    const isExport = searchParams.get('export') === 'csv';

    // Build where clause
    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (method) {
      where.method = method;
    }

    if (block) {
      where.deposit = {
        house: { block },
      };
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    if (search) {
      where.OR = [
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { user: { phone: { contains: search } } },
        { receipt: { receiptNumber: { contains: search, mode: 'insensitive' } } },
        { gatewayPaymentId: { contains: search } },
        { gatewayOrderId: { contains: search } },
        { deposit: { house: { houseNumber: { contains: search } } } },
      ];
    }

    // Export to CSV
    if (isExport) {
      const allRows = await prisma.payment.findMany({
        where,
        orderBy: { [sortBy]: order },
        include: {
          user: true,
          receipt: true,
          deposit: { include: { house: true } },
        },
      });

      const csvHeader = 'Receipt Number,Date,Resident Name,Phone,Block,House Number,Amount (₹),Method,Status,Type,Gateway Payment ID\n';
      const csvRows = allRows.map((p) => {
        const receiptNo = p.receipt?.receiptNumber || 'N/A';
        const date = p.createdAt.toISOString().split('T')[0];
        const name = `"${p.user.name.replace(/"/g, '""')}"`;
        const phone = p.user.phone;
        const b = p.deposit.house.block;
        const h = p.deposit.house.houseNumber;
        const amt = (Number(p.amount) / 100).toFixed(2);
        const m = p.method;
        const s = p.status;
        const type = p.isOffline ? 'Offline' : 'Online';
        const payId = p.gatewayPaymentId || 'N/A';
        return `${receiptNo},${date},${name},${phone},${b},${h},${amt},${m},${s},${type},${payId}`;
      });

      const csvContent = csvHeader + csvRows.join('\n');
      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="payments-export-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    // Paginated list
    const [total, payments] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: order },
        include: {
          user: { select: { id: true, name: true, phone: true } },
          receipt: { select: { id: true, receiptNumber: true, pdfUrl: true } },
          deposit: {
            select: {
              id: true,
              title: true,
              house: { select: { block: true, houseNumber: true, type: true } },
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      payments: payments.map((p) => ({
        id: p.id,
        amountPaise: p.amount.toString(),
        method: p.method,
        status: p.status,
        isOffline: p.isOffline,
        offlineNotes: p.offlineNotes,
        gatewayOrderId: p.gatewayOrderId,
        gatewayPaymentId: p.gatewayPaymentId,
        createdAt: p.createdAt.toISOString(),
        resident: p.user,
        house: p.deposit.house,
        receipt: p.receipt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Error in /api/admin/payments:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch payments' }, { status: error.statusCode || 500 });
  }
}

