import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { prisma, AuditAction } from '@colony/database';
import { cacheService, CacheKeys, invalidateSettingsCache } from '@colony/shared';

const PatchSettingsSchema = z.object({
  colonyName: z.string().trim().min(2).max(200).optional(),
  logoUrl: z.string().url().max(500).optional().nullable().or(z.literal('')),
  address: z.string().trim().max(500).optional().nullable(),
  contactPhone: z.string().trim().max(20).optional().nullable(),
  contactEmail: z.string().trim().email().optional().nullable().or(z.literal('')),
  depositRules: z.record(z.any()).optional(),
  lateFeeRules: z.record(z.any()).optional(),
  enabledPaymentMethods: z.array(z.enum(['UPI', 'CARD', 'NETBANKING', 'WALLET', 'CASH', 'CHEQUE', 'BANK_TRANSFER'])).optional(),
});

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req, ['ADMIN', 'SUPER_ADMIN']);

    const setting = await cacheService.getOrSet(
      CacheKeys.settings(),
      async () => {
        let dbSetting = await prisma.setting.findUnique({
          where: { id: 'default' },
        });

        if (!dbSetting) {
          dbSetting = await prisma.setting.create({
            data: {
              id: 'default',
              colonyName: 'Greenwood Palms Resident Welfare Association',
              depositRules: {
                standardDepositPaise: {
                  FLAT_1BHK: 2500000,
                  FLAT_2BHK: 4000000,
                  FLAT_3BHK: 6000000,
                  FLAT_4BHK: 8000000,
                  VILLA: 12000000,
                },
                maxInstallmentsAllowed: 2,
                refundablePercentage: 100,
              },
              lateFeeRules: {
                gracePeriodDays: 10,
                fixedLateFeePaise: 50000,
              },
              enabledPaymentMethods: ['UPI', 'NET_BANKING', 'DEBIT_CARD', 'CREDIT_CARD', 'CASH', 'CHEQUE'],
            },
          });
        }
        return dbSetting;
      },
      3600, // 1 hour cache
    );

    return NextResponse.json(
      { setting },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
        },
      },
    );
  } catch (error: any) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['ADMIN', 'SUPER_ADMIN']);
    const rawBody = await req.json();
    const parsed = PatchSettingsSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid settings payload', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const current = await prisma.setting.findUnique({ where: { id: 'default' } });

    const updateData: any = {};
    if (body.colonyName) updateData.colonyName = body.colonyName;
    if (body.logoUrl !== undefined) updateData.logoUrl = body.logoUrl;
    if (body.address !== undefined) updateData.address = body.address;
    if (body.contactPhone !== undefined) updateData.contactPhone = body.contactPhone;
    if (body.contactEmail !== undefined) updateData.contactEmail = body.contactEmail;
    if (body.depositRules) updateData.depositRules = body.depositRules;
    if (body.lateFeeRules) updateData.lateFeeRules = body.lateFeeRules;
    if (body.enabledPaymentMethods) updateData.enabledPaymentMethods = body.enabledPaymentMethods;

    const updated = await prisma.setting.upsert({
      where: { id: 'default' },
      update: updateData,
      create: {
        id: 'default',
        ...updateData,
      },
    });

    // Invalidate Redis cache immediately
    await invalidateSettingsCache();

    // Audit log
    await prisma.auditLog.create({
      data: {
        actorId: auth.sub,
        actorPhone: auth.phone,
        action: AuditAction.SETTINGS_UPDATED,
        entity: 'Setting',
        entityId: 'default',
        before: current ? { colonyName: current.colonyName } : undefined,
        after: updateData,
        ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
        userAgent: req.headers.get('user-agent') || 'AdminConsole',
      },
    });

    return NextResponse.json({ success: true, setting: updated });
  } catch (error: any) {
    console.error('Error updating settings:', error);
    return NextResponse.json({ error: error.message || 'Failed to update settings' }, { status: 400 });
  }
}
