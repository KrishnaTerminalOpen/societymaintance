import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma, PaymentStatus, DepositStatus } from '@colony/database';
import { cacheService, CacheKeys } from '@colony/shared';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req, ['ADMIN', 'SUPER_ADMIN']);

    const dashboardData = await cacheService.getOrSet(
      CacheKeys.adminDashboard(),
      async () => {
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

        for (const dep of allDeposits) {
          totalDuePaise += dep.amountDue;
          const balance = dep.amountDue - dep.amountPaid;
          if (balance > 0n) {
            totalPendingPaise += balance;
          }

          if (dep.status === DepositStatus.PAID) paidCount++;
          else if (dep.status === DepositStatus.PARTIAL) partialCount++;
          else if (dep.status === DepositStatus.OVERDUE) overdueCount++;
          else pendingCount++;
        }

        // 2. 14-day collection trend for Recharts
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

        const pastTwoWeeksPayments = await prisma.payment.findMany({
          where: {
            status: PaymentStatus.SUCCESS,
            createdAt: { gte: fourteenDaysAgo },
          },
          select: {
            amount: true,
            createdAt: true,
          },
        });

        const dailyMap = new Map<string, bigint>();
        for (let i = 13; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const key = d.toISOString().split('T')[0];
          dailyMap.set(key, 0n);
        }

        for (const p of pastTwoWeeksPayments) {
          const dayKey = p.createdAt.toISOString().split('T')[0];
          if (dailyMap.has(dayKey)) {
            dailyMap.set(dayKey, dailyMap.get(dayKey)! + p.amount);
          }
        }

        const dailyCollections = Array.from(dailyMap.entries()).map(([dateStr, totalPaise]) => ({
          date: dateStr,
          day: new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
          collectedRupees: Number(totalPaise / 100n),
          collectedPaise: totalPaise.toString(),
        }));

        return {
          metrics: {
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
        };
      },
      30, // 30s cache TTL
    );

    return NextResponse.json(dashboardData, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    });
  } catch (error: any) {
    console.error('Error in /api/admin/dashboard:', error);
    return NextResponse.json({ error: error.message || 'Failed to load admin dashboard' }, { status: error.statusCode || 500 });
  }
}
