import { NextRequest, NextResponse } from 'next/server';
import { getOtpService, RequestOtpSchema } from '@colony/shared';
import { prisma } from '@colony/database';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parseResult = RequestOtpSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid phone number format. Must be a valid Indian mobile number.' },
        { status: 400 },
      );
    }

    const { phone } = parseResult.data;
    const normalizedLast10 = phone.slice(-10);

    // Check if user is registered in the colony system
    let user = await prisma.user.findFirst({
      where: {
        phone: {
          endsWith: normalizedLast10, // Matches with or without +91
        },
        deletedAt: null,
      },
    });

    // Temporary open-login mode: auto-provision valid unregistered numbers as RESIDENT
    if (!user && process.env.ALLOW_OPEN_LOGIN === 'true') {
      const existingDeleted = await prisma.user.findFirst({
        where: {
          phone: {
            endsWith: normalizedLast10,
          },
        },
      });

      if (existingDeleted) {
        user = await prisma.user.update({
          where: { id: existingDeleted.id },
          data: {
            deletedAt: null,
            status: 'ACTIVE',
          },
        });
      } else {
        user = await prisma.user.create({
          data: {
            phone: `+91${normalizedLast10}`,
            name: `Resident ${normalizedLast10.slice(-4)}`,
            role: 'RESIDENT',
            status: 'ACTIVE',
          },
        });
      }
    }

    if (!user) {
      return NextResponse.json(
        {
          error:
            'This mobile number is not registered with the colony committee. Please contact your society office.',
        },
        { status: 404 },
      );
    }

    if (user.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: `Account is ${user.status.toLowerCase()}. Please contact the administrator.` },
        { status: 403 },
      );
    }

    // Extract client IP address for rate limiting
    const forwarded = req.headers.get('x-forwarded-for');
    const clientIp = forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1';

    const otpService = getOtpService();
    const result = await otpService.requestOtp(user.phone, clientIp);

    if (!result.success) {
      const status = result.cooldownSeconds > 0 || /too many/i.test(result.message) ? 429 : 503;
      return NextResponse.json(
        {
          error: result.message,
          cooldownSeconds: result.cooldownSeconds,
        },
        { status },
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      cooldownSeconds: result.cooldownSeconds,
      devOtp: result.devOtp, // Only exposed in development mode
    });
  } catch (error) {
    console.error('Error in /api/auth/send-otp:', error);
    const isDbInitError =
      process.env.NODE_ENV !== 'production' &&
      error instanceof Error &&
      error.name === 'PrismaClientInitializationError';
    return NextResponse.json(
      {
        error: isDbInitError
          ? 'Database connection failed. Ensure PostgreSQL is running, DATABASE_URL is configured, and migrations/seed have been run.'
          : 'An unexpected error occurred while sending OTP. Please try again.',
      },
      { status: 500 },
    );
  }
}

