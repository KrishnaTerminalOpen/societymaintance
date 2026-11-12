import { NextRequest, NextResponse } from 'next/server';
import { getOtpService, getSessionService, VerifyOtpSchema } from '@colony/shared';
import { prisma } from '@colony/database';
import { setAuthCookies } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parseResult = VerifyOtpSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Please enter a valid 6-digit OTP.' },
        { status: 400 },
      );
    }

    const { phone, otp } = parseResult.data;

    // Fetch user from DB
    const user = await prisma.user.findFirst({
      where: {
        phone: {
          endsWith: phone.slice(-10),
        },
        deletedAt: null,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User record not found.' },
        { status: 404 },
      );
    }

    const otpService = getOtpService();
    const verifyResult = await otpService.verifyOtp(user.phone, otp);

    if (!verifyResult.success) {
      return NextResponse.json(
        {
          error: verifyResult.error || 'Invalid OTP.',
          attemptsLeft: verifyResult.attemptsLeft,
        },
        { status: 400 },
      );
    }

    // Capture metadata for session tracking & audit log
    const forwarded = req.headers.get('x-forwarded-for');
    const clientIp = forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || 'Unknown';

    // Create session in Redis & sign tokens
    const sessionService = getSessionService();
    const { accessToken, refreshToken, sessionId } = await sessionService.createSession(
      {
        id: user.id,
        phone: user.phone,
        name: user.name,
        role: user.role,
        status: user.status,
      },
      {
        ipAddress: clientIp,
        userAgent,
      },
    );

    // Audit Log: successful login
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorPhone: user.phone,
        action: 'LOGIN',
        entity: 'User',
        entityId: user.id,
        before: undefined,
        after: {
          role: user.role,
          sessionId,
          loginMethod: 'OTP_PHONE',
        },
        ipAddress: clientIp,
        userAgent,
      },
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        role: user.role,
      },
      redirectUrl: user.role === 'RESIDENT' ? '/resident' : '/admin',
    });

    // Set httpOnly secure cookies
    return setAuthCookies(response, accessToken, refreshToken);
  } catch (error) {
    console.error('Error in /api/auth/verify-otp:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while verifying OTP.' },
      { status: 500 },
    );
  }
}
