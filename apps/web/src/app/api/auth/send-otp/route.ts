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

    // Check if user is registered in the colony system
    const user = await prisma.user.findFirst({
      where: {
        phone: {
          endsWith: phone.slice(-10), // Matches with or without +91
        },
        deletedAt: null,
      },
    });

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
      return NextResponse.json(
        {
          error: result.message,
          cooldownSeconds: result.cooldownSeconds,
        },
        { status: 429 },
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
    return NextResponse.json(
      { error: 'An unexpected error occurred while sending OTP. Please try again.' },
      { status: 500 },
    );
  }
}

