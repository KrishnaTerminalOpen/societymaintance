import { NextRequest, NextResponse } from 'next/server';
import { getSessionService, verifyAccessToken } from '@colony/shared';
import { ACCESS_COOKIE_NAME, clearAuthCookies } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const accessToken = req.cookies.get(ACCESS_COOKIE_NAME)?.value;

    if (accessToken) {
      const payload = await verifyAccessToken(accessToken);
      if (payload && payload.sub && payload.sessionId) {
        const sessionService = getSessionService();
        await sessionService.revokeSession(payload.sub, payload.sessionId);
      }
    }

    const response = NextResponse.json({ success: true, message: 'Logged out successfully.' });
    return clearAuthCookies(response);
  } catch (error) {
    console.error('Error in /api/auth/logout:', error);
    const response = NextResponse.json({ success: true });
    return clearAuthCookies(response);
  }
}

