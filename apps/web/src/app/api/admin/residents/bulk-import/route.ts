import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma, UserRole, UserStatus, HouseType, DepositStatus, AuditAction } from '@colony/database';
import { IndianPhoneRegex } from '@colony/shared/edge';

interface BulkResidentRow {
  name: string;
  phone: string;
  email?: string;
  block: string;
  houseNumber: string;
  houseType?: string;
  depositRupees?: number;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['ADMIN', 'SUPER_ADMIN']);
    const { rows } = (await req.json()) as { rows: BulkResidentRow[] };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: 'No data rows provided for bulk import.' },
        { status: 400 },
      );
    }

    const errors: Array<{ row: number; identifier: string; reason: string }> = [];
    const validRowsToCreate: Array<BulkResidentRow & { depositPaise: bigint }> = [];

    // Track seen phones and house units in this batch to prevent duplicates
    const seenPhones = new Set<string>();
    const seenHouses = new Set<string>();

    // 1. Row-by-row validation
    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 1;
      const r = rows[i];
      const identifier = `${r.name || 'Unknown'} (${r.block || '?'}-${r.houseNumber || '?'})`;

      if (!r.name || r.name.trim().length < 2) {
        errors.push({ row: rowNum, identifier, reason: 'Name is required (at least 2 chars)' });
        continue;
      }

      if (!r.phone || !IndianPhoneRegex.test(r.phone.trim())) {
        errors.push({ row: rowNum, identifier, reason: `Invalid Indian mobile number: ${r.phone}` });
        continue;
      }

      if (!r.block || !r.houseNumber) {
        errors.push({ row: rowNum, identifier, reason: 'Block and House Number are required' });
        continue;
      }

      const formattedPhone = r.phone.trim().startsWith('+91')
        ? r.phone.trim()
        : `+91${r.phone.trim().slice(-10)}`;
      const houseKey = `${r.block.trim().toUpperCase()}_${r.houseNumber.trim()}`;

      if (seenPhones.has(formattedPhone)) {
        errors.push({ row: rowNum, identifier, reason: `Duplicate phone number in import batch: ${formattedPhone}` });
        continue;
      }

      if (seenHouses.has(houseKey)) {
        errors.push({ row: rowNum, identifier, reason: `Duplicate house in import batch: ${r.block}-${r.houseNumber}` });
        continue;
      }

      seenPhones.add(formattedPhone);
      seenHouses.add(houseKey);

      // Check DB collisions
      const existingUser = await prisma.user.findFirst({
        where: { phone: { endsWith: formattedPhone.slice(-10) } },
      });
      if (existingUser) {
        errors.push({ row: rowNum, identifier, reason: `Phone already registered in database (${formattedPhone})` });
        continue;
      }

      const existingHouse = await prisma.house.findUnique({
        where: {
          block_houseNumber: {
            block: r.block.trim(),
            houseNumber: r.houseNumber.trim(),
          },
        },
      });
      if (existingHouse) {
        errors.push({ row: rowNum, identifier, reason: `House ${r.block}-${r.houseNumber} already exists in database` });
        continue;
      }

      const depositPaise = r.depositRupees ? BigInt(Math.round(r.depositRupees * 100)) : 4000000n; // Default ₹40,000

      validRowsToCreate.push({
        ...r,
        phone: formattedPhone,
        block: r.block.trim(),
        houseNumber: r.houseNumber.trim(),
        depositPaise,
      });
    }

    // 2. Transactional insertion of valid rows
    let importedCount = 0;

    if (validRowsToCreate.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const item of validRowsToCreate) {
          const user = await tx.user.create({
            data: {
              name: item.name.trim(),
              phone: item.phone,
              email: item.email?.trim() || null,
              role: UserRole.RESIDENT,
              status: UserStatus.ACTIVE,
            },
          });

          const houseType = (item.houseType as HouseType) || HouseType.FLAT_2BHK;
          const house = await tx.house.create({
            data: {
              block: item.block,
              houseNumber: item.houseNumber,
              type: houseType,
              ownerId: user.id,
            },
          });

          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 30);

          await tx.deposit.create({
            data: {
              houseId: house.id,
              title: `Security Deposit - Flat ${item.block}-${item.houseNumber}`,
              amountDue: item.depositPaise,
              amountPaid: 0n,
              status: DepositStatus.PENDING,
              dueDate,
            },
          });

          importedCount++;
        }

        // Audit Log
        await tx.auditLog.create({
          data: {
            actorId: auth.sub,
            actorPhone: auth.phone,
            action: AuditAction.CREATE,
            entity: 'ResidentBulkImport',
            entityId: `batch_${Date.now()}`,
            before: undefined,
            after: {
              importedCount,
              failedCount: errors.length,
            },
            ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
            userAgent: req.headers.get('user-agent') || 'AdminConsole',
          },
        });
      });
    }

    return NextResponse.json({
      success: true,
      totalRows: rows.length,
      importedCount,
      failedCount: errors.length,
      errors,
    });
  } catch (error: any) {
    console.error('Error in bulk import:', error);
    return NextResponse.json({ error: error.message || 'Bulk import failed' }, { status: 500 });
  }
}

