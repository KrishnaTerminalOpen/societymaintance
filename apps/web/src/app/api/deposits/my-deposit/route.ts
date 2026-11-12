import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@colony/database';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find the house owned by this resident
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
              include: {
                receipt: true,
              },
            },
          },
        },
      },
    });

    if (!house || house.deposits.length === 0) {
      return NextResponse.json({ deposit: null, house: house || null });
    }

    const deposit = house.deposits[0];

    return NextResponse.json({
      house: {
        id: house.id,
        block: house.block,
        houseNumber: house.houseNumber,
        type: house.type,
      },
      deposit: {
        id: deposit.id,
        title: deposit.title,
        amountDue: deposit.amountDue.toString(),
        amountPaid: deposit.amountPaid.toString(),
        status: deposit.status,
        dueDate: deposit.dueDate,
        payments: deposit.payments.map((p) => ({
          id: p.id,
          amount: p.amount.toString(),
          method: p.method,
          status: p.status,
          createdAt: p.createdAt,
          receiptNumber: p.receipt?.receiptNumber,
          pdfUrl: p.receipt?.pdfUrl,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching resident deposit:', error);
    return NextResponse.json({ error: 'Failed to fetch deposit details' }, { status: 500 });
  }
}

