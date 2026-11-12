import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma, DepositStatus, AuditAction, NotificationStatus } from '@colony/database';
import { formatPaiseToINR } from '@colony/shared';

export async function POST(req: NextRequest) {
  try {
    const authUser = await requireAuth(req, ['ADMIN', 'SUPER_ADMIN']);
    const body = await req.json();

    const {
      userId,
      block,
      depositStatus = 'ALL',
      channel = 'ALL',
      batchSize = 10,
      delayBetweenBatchesSeconds = 3,
    } = body;

    // 1. Single Resident Reminder
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          houses: {
            include: {
              deposits: {
                where: {
                  status: { in: [DepositStatus.PENDING, DepositStatus.PARTIAL, DepositStatus.OVERDUE] },
                },
              },
            },
          },
        },
      });

      if (!user) {
        return NextResponse.json({ error: 'Resident not found' }, { status: 404 });
      }

      const activeDeposit = user.houses[0]?.deposits[0];
      const remainingPaise = activeDeposit ? activeDeposit.amountDue - activeDeposit.amountPaid : 0n;
      const isOverdue = activeDeposit ? new Date(activeDeposit.dueDate) < new Date() : false;

      const setting = await prisma.setting.findFirst();
      const colonyName = setting?.colonyName || 'Colony RWA';

      const reminderTitle = isOverdue ? 'URGENT: Security Deposit Overdue' : 'Security Deposit Due Date Reminder';
      const reminderText = `Reminder from ${colonyName}: Your security deposit balance of ${formatPaiseToINR(remainingPaise)} for Unit ${user.houses[0]?.block || ''}-${user.houses[0]?.houseNumber || ''} is ${isOverdue ? 'OVERDUE' : 'due soon'}. Please pay via your resident mobile portal.`;

      // Store in notifications DB for resident
      const notif = await prisma.notification.create({
        data: {
          userId: user.id,
          title: reminderTitle,
          message: reminderText,
          type: isOverdue ? 'PAYMENT_OVERDUE' : 'PAYMENT_DUE',
          channel: channel === 'ALL' ? 'SMS' : channel,
          status: NotificationStatus.SENT,
          metadata: {
            sentByAdminId: authUser.sub,
            colonyName,
            amountPaise: Number(remainingPaise),
            unit: `${user.houses[0]?.block}-${user.houses[0]?.houseNumber}`,
          },
        },
      });

      // Audit Log
      await prisma.auditLog.create({
        data: {
          actorId: authUser.sub,
          actorPhone: authUser.phone,
          action: AuditAction.CREATE,
          entity: 'Notification',
          entityId: notif.id,
          before: undefined,
          after: { recipient: user.name, type: isOverdue ? 'OVERDUE' : 'DUE_DATE', channel },
        },
      });

      return NextResponse.json({
        success: true,
        message: `Reminder sent to ${user.name}`,
        notificationId: notif.id,
      });
    }

    // 2. Bulk Reminders with Batching
    const where: any = {};
    if (depositStatus === 'OVERDUE') {
      where.status = DepositStatus.OVERDUE;
    } else if (depositStatus === 'PENDING') {
      where.status = { in: [DepositStatus.PENDING, DepositStatus.PARTIAL] };
    } else {
      where.status = { in: [DepositStatus.PENDING, DepositStatus.PARTIAL, DepositStatus.OVERDUE] };
    }

    if (block && block !== 'ALL') {
      where.house = { block };
    }

    const eligibleDeposits = await prisma.deposit.findMany({
      where,
      include: {
        house: {
          include: {
            owner: true,
          },
        },
      },
    });

    if (eligibleDeposits.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No eligible residents found matching criteria.',
        count: 0,
        batches: 0,
      });
    }

    const setting = await prisma.setting.findFirst();
    const colonyName = setting?.colonyName || 'Colony RWA';

    // Group into batches of batchSize
    const batches: (typeof eligibleDeposits)[] = [];
    const size = Math.max(1, Number(batchSize) || 10);
    for (let i = 0; i < eligibleDeposits.length; i += size) {
      batches.push(eligibleDeposits.slice(i, i + size));
    }

    let notificationsCreated = 0;

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const currentBatch = batches[batchIdx];

      for (const deposit of currentBatch) {
        const owner = deposit.house.owner;
        if (!owner) continue;

        const remaining = deposit.amountDue - deposit.amountPaid;
        const isOverdue = deposit.status === DepositStatus.OVERDUE || new Date(deposit.dueDate) < new Date();

        await prisma.notification.create({
          data: {
            userId: owner.id,
            title: isOverdue ? 'URGENT: Security Deposit Overdue' : 'Security Deposit Due Date Reminder',
            message: `Reminder from ${colonyName}: Security deposit balance of ${formatPaiseToINR(remaining)} for Unit ${deposit.house.block}-${deposit.house.houseNumber} is ${isOverdue ? 'OVERDUE' : 'due soon'}.`,
            type: isOverdue ? 'PAYMENT_OVERDUE' : 'PAYMENT_DUE',
            channel: channel === 'ALL' ? 'SMS' : channel,
            status: NotificationStatus.SENT,
            metadata: {
              batchIndex: batchIdx,
              batchSize: size,
              delayScheduledSeconds: batchIdx * Number(delayBetweenBatchesSeconds),
              amountPaise: Number(remaining),
            },
          },
        });

        notificationsCreated++;
      }
    }

    // Audit Log for Bulk Action
    await prisma.auditLog.create({
      data: {
        actorId: authUser.sub,
        actorPhone: authUser.phone,
        action: AuditAction.UPDATE,
        entity: 'Deposit',
        entityId: 'BULK_REMINDERS',
        before: { block: block || 'ALL', depositStatus },
        after: {
          totalScheduled: notificationsCreated,
          batchesCount: batches.length,
          batchSize: size,
          delayBetweenBatchesSeconds,
          channel,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: `Successfully scheduled ${notificationsCreated} reminders in ${batches.length} staggered batches (${delayBetweenBatchesSeconds}s delay between batches).`,
      count: notificationsCreated,
      batches: batches.length,
    });
  } catch (err: any) {
    if (err.message?.includes('Unauthorized') || err.message?.includes('Forbidden')) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

