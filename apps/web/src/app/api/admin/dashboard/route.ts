import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma, PaymentStatus, DepositStatus } from '@colony/database';

export async function GET(req: NextRequest) {
  try {
    const authUser = await requireAuth(req, ['ADMIN', 'SUPER_ADMIN']);

    // 1. Aggregates: Total collected and total pending
    const [
      allDeposits,
      successfulPayments,
      totalHousesCount,
      recentPayments,
    ] = await Promise.all([
      prisma.deposit.findMany({
        select: {
          amountDue: true,
          amountPaid: true,
          status: true,
        },
      }),
      prisma.payment.aggregate({
        where: { status: PaymentStatus.SUCCESS },
        _sum: { amount: true },
        _count: { id: true },
      }),
      prisma.house.count({ where: { deletedAt: null } }),
      prisma.payment.findMany({
        where: { status: PaymentStatus.SUCCESS },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: {
          user: { select: { name: true, phone: true } },
          receipt: { select: { receiptNumber: true } },
          deposit: {
            select: {
              title: true,
              house: { select: { block: true, houseNumber: true } },
            },
          },
        },
      }),
    ]);

    // Financial totals in integer paise
    const totalCollectedPaise = successfulPayments._sum.amount ? BigInt(successfulPayments._sum.amount) : 0n;

    let totalDuePaise = 0n;
    let totalPendingPaise = 0n;
    let paidCount = 0;
    let partialCount = 0;
    let pendingCount = 0;
    let overdueCount = 0;

    for (const d of allDeposits) {
      const due = BigInt(d.amountDue);
      const paid = BigInt(d.amountPaid);
      totalDuePaise += due;
      const balance = due > paid ? due - paid : 0n;
      totalPendingPaise += balance;

      if (d.status === DepositStatus.PAID || balance === 0n) {
        paidCount++;
      } else if (d.status === DepositStatus.PARTIAL) {
        partialCount++;
      } else if (d.status === DepositStatus.OVERDUE) {
        overdueCount++;
      } else {
        pendingCount++;
      }
    }

    // 2. Timeline Aggregation for Recharts: Daily collections over the last 14 days
    const dailyCollections: Array<{ date: string; amountRupees: number; count: number }> = [];
    const now = new Date();

    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const startOfDay = new Date(d.setHours(0, 0, 0, 0));
      const endOfDay = new Date(d.setHours(23, 59, 59, 999));

      const dayPayments = await prisma.payment.aggregate({
        where: {
          status: PaymentStatus.SUCCESS,
          createdAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        _sum: { amount: true },
        _count: { id: true },
      });

      const dayPaise = dayPayments._sum.amount ? BigInt(dayPayments._sum.amount) : 0n;

      dailyCollections.push({
        date: startOfDay.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        amountRupees: Number(dayPaise) / 100,
        count: dayPayments._count.id,
      });
    }

    return NextResponse.json({
      summary: {
        totalCollectedPaise: totalCollectedPaise.toString(),
        totalPendingPaise: totalPendingPaise.toString(),
        totalDuePaise: totalDuePaise.toString(),
        totalPaymentsCount: successfulPayments._count.id,
        totalHousesCount,
        householdCounts: {
          total: totalHousesCount,
          paid: paidCount,
          partial: partialCount,
          pending: pendingCount,
          overdue: overdueCount,
        },
      },
      chartData: dailyCollections,
      recentPayments: recentPayments.map((p) => ({
        id: p.id,
        amountPaise: p.amount.toString(),
        method: p.method,
        status: p.status,
        isOffline: p.isOffline,
        createdAt: p.createdAt.toISOString(),
        residentName: p.user.name,
        residentPhone: p.user.phone,
        houseLabel: `Flat ${p.deposit.house.block}-${p.deposit.house.houseNumber}`,
        receiptNumber: p.receipt?.receiptNumber,
      })),
    });
  } catch (error: any) {
    console.error('Error in /api/admin/dashboard:', error);
    return NextResponse.json({ error: error.message || 'Failed to load admin dashboard' }, { status: error.statusCode || 500 });
  }
}

