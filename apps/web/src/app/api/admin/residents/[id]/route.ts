import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma, UserStatus, AuditAction } from '@colony/database';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(req, ['ADMIN', 'SUPER_ADMIN']);
    const { id } = await params;
    const body = await req.json();

    const { name, email, status, deactivate } = body;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ error: 'Resident not found' }, { status: 404 });
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (email !== undefined) updateData.email = email || null;
    if (status) updateData.status = status as UserStatus;

    if (deactivate) {
      updateData.status = UserStatus.INACTIVE;
      updateData.deletedAt = new Date();
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        actorId: auth.sub,
        actorPhone: auth.phone,
        action: deactivate ? AuditAction.DELETE : AuditAction.UPDATE,
        entity: 'Resident',
        entityId: id,
        before: { name: user.name, status: user.status },
        after: updateData,
        ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
        userAgent: req.headers.get('user-agent') || 'AdminConsole',
      },
    });

    return NextResponse.json({ success: true, user: updated });
  } catch (error: any) {
    console.error('Error updating resident:', error);
    return NextResponse.json({ error: error.message || 'Failed to update resident' }, { status: 400 });
  }
}

