import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAccessToken,
  JwtAccessTokenPayload,
  ForbiddenException,
  UnauthorizedException,
  UserRole,
  canAccessResidentData,
  hasRole,
} from '@colony/shared';

export const ACCESS_COOKIE_NAME = 'colony_access_token';
export const REFRESH_COOKIE_NAME = 'colony_refresh_token';

/**
 * Extracts and verifies the access token from cookies or Authorization header.
 */
export async function getSessionUser(
  req?: NextRequest,
): Promise<JwtAccessTokenPayload | null> {
  let token: string | undefined;

  if (req) {
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      token = req.cookies.get(ACCESS_COOKIE_NAME)?.value;
    }
  } else {
    const cookieStore = await cookies();
    token = cookieStore.get(ACCESS_COOKIE_NAME)?.value;
  }

  if (!token) return null;

  return verifyAccessToken(token);
}

/**
 * Route protection guard for Next.js Route Handlers / Server Actions.
 */
export async function requireAuth(
  req?: NextRequest,
  allowedRoles?: UserRole[],
): Promise<JwtAccessTokenPayload> {
  const user = await getSessionUser(req);
  if (!user) {
    throw new UnauthorizedException('Authentication required to access this endpoint.');
  }

  if (allowedRoles && allowedRoles.length > 0) {
    if (!hasRole(user.role, allowedRoles)) {
      throw new ForbiddenException(
        `Insufficient permissions. Requires: ${allowedRoles.join(' or ')}`,
      );
    }
  }

  return user;
}

/**
 * Resident isolation guard. Throws 403 if resident attempts to access another resident's data.
 */
export async function requireResidentOwnership(
  targetResidentId: string,
  req?: NextRequest,
): Promise<JwtAccessTokenPayload> {
  const user = await requireAuth(req);

  if (!canAccessResidentData({ id: user.sub, role: user.role }, targetResidentId)) {
    throw new ForbiddenException(
      'Resident Isolation Violation: You are not permitted to access this resident record.',
    );
  }

  return user;
}

/**
 * Helper to set auth cookies on a NextResponse.
 */
export function setAuthCookies(
  res: NextResponse,
  accessToken: string,
  refreshToken: string,
): NextResponse {
  const isProd = process.env.NODE_ENV === 'production';

  // 15 minutes access token
  res.cookies.set({
    name: ACCESS_COOKIE_NAME,
    value: accessToken,
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 15 * 60,
    path: '/',
  });

  // 7 days refresh token
  res.cookies.set({
    name: REFRESH_COOKIE_NAME,
    value: refreshToken,
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });

  return res;
}

/**
 * Helper to clear auth cookies on logout.
 */
export function clearAuthCookies(res: NextResponse): NextResponse {
  res.cookies.set({
    name: ACCESS_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });

  res.cookies.set({
    name: REFRESH_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });

  return res;
}
