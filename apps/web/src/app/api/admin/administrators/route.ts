import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma, UserRole, UserStatus, AuditAction } from '@colony/database';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['SUPER_ADMIN']);

    const admins = await prisma.user.findMany({
      where: {
        role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ admins });
  } catch (error: any) {
    console.error('Error fetching admins:', error);
    return NextResponse.json({ error: error.message || 'Access Denied: Super Admin only' }, { status: error.statusCode || 403 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['SUPER_ADMIN']);
    const { name, phone, email, role = UserRole.ADMIN } = await req.json();

    if (!name || !phone) {
      return NextResponse.json({ error: 'Name and phone are required.' }, { status: 400 });
    }

    const formattedPhone = phone.trim().startsWith('+91')
      ? phone.trim()
      : `+91${phone.trim().slice(-10)}`;

    const existingUser = await prisma.user.findFirst({
      where: { phone: { endsWith: formattedPhone.slice(-10) } },
    });

    let adminUser;

    if (existingUser) {
      // Promote existing user
      adminUser = await prisma.user.update({
        where: { id: existingUser.id },
        data: { role: role as UserRole },
      });
    } else {
      // Create new Admin user
      adminUser = await prisma.user.create({
        data: {
          name,
          phone: formattedPhone,
          email: email || null,
          role: role as UserRole,
          status: UserStatus.ACTIVE,
        },
      });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        actorId: auth.sub,
        actorPhone: auth.phone,
        action: AuditAction.UPDATE,
        entity: 'AdminRole',
        entityId: adminUser.id,
        before: existingUser ? { role: existingUser.role } : undefined,
        after: { role: adminUser.role, assignedBy: 'SuperAdmin' },
        ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
        userAgent: req.headers.get('user-agent') || 'AdminConsole',
      },
    });

    return NextResponse.json({ success: true, admin: adminUser });
  } catch (error: any) {
    console.error('Error creating admin:', error);
    return NextResponse.json({ error: error.message || 'Failed to create admin' }, { status: error.statusCode || 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['SUPER_ADMIN']);
    const { id, role, status } = await req.json();

    if (!id) {
      return NextResponse.json({ error: 'Admin user ID required.' }, { status: 400 });
    }

    // Prevent super admin from demoting themselves
    if (id === auth.sub && role && role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json({ error: 'You cannot demote yourself from Super Admin.' }, { status: 400 });
    }

    const current = await prisma.user.findUnique({ where: { id } });
    if (!current) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const updateData: any = {};
    if (role) updateData.role = role as UserRole;
    if (status) updateData.status = status as UserStatus;

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        actorId: auth.sub,
        actorPhone: auth.phone,
        action: AuditAction.UPDATE,
        entity: 'AdminRole',
        entityId: id,
        before: { role: current.role, status: current.status },
        after: updateData,
        ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
        userAgent: req.headers.get('user-agent') || 'AdminConsole',
      },
    });

    return NextResponse.json({ success: true, admin: updated });
  } catch (error: any) {
    console.error('Error updating admin:', error);
    return NextResponse.json({ error: error.message || 'Failed to update admin' }, { status: error.statusCode || 400 });
  }
}

