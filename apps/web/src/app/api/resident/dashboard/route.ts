import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@colony/database';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find house & active deposit for this resident
    const house = await prisma.house.findFirst({
      where: {
        ownerId: session.sub,
        deletedAt: null,
      },
      include: {
        deposits: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            payments: {
              orderBy: { createdAt: 'desc' },
              take: 5,
              include: {
                receipt: true,
              },
            },
          },
        },
      },
    });

    // Unread notifications count
    const unreadNotificationsCount = await prisma.notification.count({
      where: {
        userId: session.sub,
        readAt: null,
      },
    });

    if (!house || house.deposits.length === 0) {
      return NextResponse.json({
        hasDeposit: false,
        house: house
          ? {
              id: house.id,
              block: house.block,
              houseNumber: house.houseNumber,
              type: house.type,
            }
          : null,
        unreadNotificationsCount,
      });
    }

    const deposit = house.deposits[0];
    const amountDue = BigInt(deposit.amountDue);
    const amountPaid = BigInt(deposit.amountPaid);
    const remainingBalance = amountDue > amountPaid ? amountDue - amountPaid : 0n;

    // Check if deposit is overdue
    const isOverdue = deposit.status === 'OVERDUE' || (remainingBalance > 0n && new Date() > new Date(deposit.dueDate));
    const effectiveStatus = remainingBalance === 0n ? 'PAID' : isOverdue ? 'OVERDUE' : deposit.status;

    return NextResponse.json({
      hasDeposit: true,
      house: {
        id: house.id,
        block: house.block,
        houseNumber: house.houseNumber,
        type: house.type,
      },
      deposit: {
        id: deposit.id,
        title: deposit.title,
        amountDuePaise: amountDue.toString(),
        amountPaidPaise: amountPaid.toString(),
        remainingBalancePaise: remainingBalance.toString(),
        status: effectiveStatus,
        dueDate: deposit.dueDate.toISOString(),
      },
      recentPayments: deposit.payments.map((p) => ({
        id: p.id,
        amountPaise: p.amount.toString(),
        method: p.method,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
        receiptNumber: p.receipt?.receiptNumber,
        pdfUrl: p.receipt?.pdfUrl,
      })),
      unreadNotificationsCount,
    });
  } catch (error) {
    console.error('Error in /api/resident/dashboard:', error);
    return NextResponse.json({ error: 'Failed to fetch resident dashboard' }, { status: 500 });
  }
}
