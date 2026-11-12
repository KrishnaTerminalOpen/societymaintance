import { NextRequest, NextResponse } from 'next/server';
import { getSessionService } from '@colony/shared';
import { prisma } from '@colony/database';
import { REFRESH_COOKIE_NAME, setAuthCookies, clearAuthCookies } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const refreshToken = req.cookies.get(REFRESH_COOKIE_NAME)?.value;

    if (!refreshToken) {
      const res = NextResponse.json(
        { error: 'No refresh token provided.' },
        { status: 401 },
      );
      return clearAuthCookies(res);
    }

    const sessionService = getSessionService();

    const rotationResult = await sessionService.rotateRefreshToken(
      refreshToken,
      async (userId) => {
        const user = await prisma.user.findUnique({
          where: { id: userId },
        });
        if (!user || user.deletedAt) return null;
        return {
          id: user.id,
          phone: user.phone,
          name: user.name,
          role: user.role,
          status: user.status,
        };
      },
    );

    if (!rotationResult) {
      const res = NextResponse.json(
        { error: 'Invalid or expired session. Please log in again.' },
        { status: 401 },
      );
      return clearAuthCookies(res);
    }

    const response = NextResponse.json({ success: true });
    return setAuthCookies(
      response,
      rotationResult.accessToken,
      rotationResult.refreshToken,
    );
  } catch (error) {
    console.error('Error in /api/auth/refresh:', error);
    const res = NextResponse.json(
      { error: 'Failed to refresh authentication session.' },
      { status: 500 },
    );
    return clearAuthCookies(res);
  }
}

