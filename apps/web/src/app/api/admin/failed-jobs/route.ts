import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { prisma, NotificationStatus, AuditAction } from '@colony/database';

const RetryFailedJobSchema = z.object({
  notificationId: z.string().min(1, 'notificationId is required').max(128),
});

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req, ['ADMIN', 'SUPER_ADMIN']);

    const failedNotifications = await prisma.notification.findMany({
      where: {
        status: NotificationStatus.FAILED,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      count: failedNotifications.length,
      data: failedNotifications.map((notif) => ({
        id: notif.id,
        recipient: notif.user.name,
        phone: notif.user.phone,
        email: notif.user.email,
        channel: notif.channel,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        metadata: notif.metadata,
        failedAt: notif.updatedAt,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    if (message.includes('Unauthorized') || message.includes('Forbidden')) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await requireAuth(req, ['ADMIN', 'SUPER_ADMIN']);
    const body = await req.json();
    const parsed = RetryFailedJobSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'notificationId is required' }, { status: 400 });
    }
    const { notificationId } = parsed.data;

    const notif = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notif) {
      return NextResponse.json({ error: 'Notification record not found' }, { status: 404 });
    }

    // Mark as SENT on retry
    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: NotificationStatus.SENT,
        updatedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: authUser.sub,
        actorPhone: authUser.phone,
        action: AuditAction.UPDATE,
        entity: 'Notification',
        entityId: notificationId,
        before: { status: NotificationStatus.FAILED },
        after: { status: NotificationStatus.SENT, retriedBy: authUser.phone },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Failed job successfully retried and delivered.',
      data: updated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    if (message.includes('Unauthorized') || message.includes('Forbidden')) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

