import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma, UserRole, UserStatus, HouseType, DepositStatus, AuditAction } from '@colony/database';
import { CreateUserSchema } from '@colony/shared/edge';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req, ['ADMIN', 'SUPER_ADMIN']);

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim() || '';
    const block = searchParams.get('block')?.trim() || '';
    const status = searchParams.get('status')?.trim() || '';

    const where: any = {
      role: UserRole.RESIDENT,
    };

    if (status) {
      where.status = status as UserStatus;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
        { houses: { some: { houseNumber: { contains: search } } } },
      ];
    }

    if (block) {
      where.houses = { some: { block } };
    }

    const residents = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        houses: {
          include: {
            deposits: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    return NextResponse.json({
      residents: residents.map((r) => {
        const primaryHouse = r.houses[0];
        const primaryDeposit = primaryHouse?.deposits[0];

        return {
          id: r.id,
          name: r.name,
          phone: r.phone,
          email: r.email,
          status: r.status,
          deletedAt: r.deletedAt,
          createdAt: r.createdAt.toISOString(),
          house: primaryHouse
            ? {
                id: primaryHouse.id,
                block: primaryHouse.block,
                houseNumber: primaryHouse.houseNumber,
                type: primaryHouse.type,
              }
            : null,
          deposit: primaryDeposit
            ? {
                id: primaryDeposit.id,
                title: primaryDeposit.title,
                amountDuePaise: primaryDeposit.amountDue.toString(),
                amountPaidPaise: primaryDeposit.amountPaid.toString(),
                remainingPaise: (
                  BigInt(primaryDeposit.amountDue) - BigInt(primaryDeposit.amountPaid)
                ).toString(),
                status: primaryDeposit.status,
                dueDate: primaryDeposit.dueDate.toISOString(),
              }
            : null,
        };
      }),
    });
  } catch (error: any) {
    console.error('Error fetching residents:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch residents' }, { status: error.statusCode || 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['ADMIN', 'SUPER_ADMIN']);
    const body = await req.json();

    const {
      name,
      phone,
      email,
      block,
      houseNumber,
      houseType = 'FLAT_2BHK',
      customDepositPaise,
    } = body;

    // Validate phone and name
    const parse = CreateUserSchema.safeParse({ name, phone, email });
    if (!parse.success) {
      return NextResponse.json(
        { error: 'Invalid resident details. Check phone number and name.' },
        { status: 400 },
      );
    }

    if (!block || !houseNumber) {
      return NextResponse.json({ error: 'Block and House number are required.' }, { status: 400 });
    }

    // Check if house block + number already exists
    const existingHouse = await prisma.house.findUnique({
      where: {
        block_houseNumber: {
          block,
          houseNumber,
        },
      },
    });

    if (existingHouse) {
      return NextResponse.json(
        { error: `House ${block}-${houseNumber} already exists in the colony.` },
        { status: 409 },
      );
    }

    // Check if phone already registered
    const existingUser = await prisma.user.findUnique({
      where: { phone },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: `Phone number ${phone} is already registered.` },
        { status: 409 },
      );
    }

    // Read standard deposit from settings
    const settings = await prisma.setting.findUnique({ where: { id: 'default' } });
    const depositRules = (settings?.depositRules as any)?.standardDepositPaise || {};
    const defaultAmountPaise = depositRules[houseType] || 4000000; // default ₹40,000

    const finalDepositPaise = customDepositPaise
      ? BigInt(customDepositPaise)
      : BigInt(defaultAmountPaise);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create User
      const user = await tx.user.create({
        data: {
          name,
          phone,
          email: email || null,
          role: UserRole.RESIDENT,
          status: UserStatus.ACTIVE,
        },
      });

      // 2. Create House
      const house = await tx.house.create({
        data: {
          block,
          houseNumber,
          type: houseType as HouseType,
          ownerId: user.id,
        },
      });

      // 3. Create initial Deposit obligation
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30); // 30 days due

      const deposit = await tx.deposit.create({
        data: {
          houseId: house.id,
          title: `Security Deposit - Flat ${block}-${houseNumber}`,
          amountDue: finalDepositPaise,
          amountPaid: 0n,
          status: DepositStatus.PENDING,
          dueDate,
        },
      });

      // 4. Audit Log
      await tx.auditLog.create({
        data: {
          actorId: auth.sub,
          actorPhone: auth.phone,
          action: AuditAction.CREATE,
          entity: 'Resident',
          entityId: user.id,
          before: undefined,
          after: {
            name: user.name,
            phone: user.phone,
            house: `${block}-${houseNumber}`,
            depositPaise: finalDepositPaise.toString(),
          },
          ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
          userAgent: req.headers.get('user-agent') || 'AdminConsole',
        },
      });

      return { user, house, deposit };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Error creating resident:', error);
    return NextResponse.json({ error: error.message || 'Failed to create resident' }, { status: 400 });
  }
}

