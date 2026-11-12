import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma, AuditAction } from '@colony/database';
import { z } from 'zod';

const UpdateProfileSchema = z.object({
  email: z.string().email().optional().or(z.literal('')),
});

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.sub },
      include: {
        houses: {
          where: { deletedAt: null },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      profile: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        status: user.status,
        joinedDate: user.createdAt.toISOString(),
        houses: user.houses.map((h) => ({
          id: h.id,
          block: h.block,
          houseNumber: h.houseNumber,
          type: h.type,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const parse = UpdateProfileSchema.safeParse(body);

    if (!parse.success) {
      return NextResponse.json({ error: 'Invalid profile data' }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: session.sub },
      data: {
        email: parse.data.email || null,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: session.sub,
        actorPhone: session.phone,
        action: AuditAction.UPDATE,
        entity: 'User',
        entityId: session.sub,
        before: undefined,
        after: { email: updated.email },
      },
    });

    return NextResponse.json({ success: true, email: updated.email });
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
