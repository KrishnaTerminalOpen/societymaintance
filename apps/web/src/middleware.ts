import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, hasRole } from '@colony/shared/edge';

const ACCESS_COOKIE_NAME = 'colony_access_token';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Protected paths
  const isAdminPath = pathname.startsWith('/admin');
  const isResidentPath = pathname.startsWith('/resident');

  if (!isAdminPath && !isResidentPath) {
    return NextResponse.next();
  }

  const token = req.cookies.get(ACCESS_COOKIE_NAME)?.value;

  if (!token) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('returnUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const payload = await verifyAccessToken(token);

  if (!payload || !payload.sub) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('returnUrl', pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(ACCESS_COOKIE_NAME);
    return response;
  }

  // RBAC Route Protection:
  // Admin routes: only ADMIN or SUPER_ADMIN
  if (isAdminPath && !hasRole(payload.role, ['ADMIN', 'SUPER_ADMIN'])) {
    // Non-admin trying to access /admin -> redirect to /resident
    return NextResponse.redirect(new URL('/resident', req.url));
  }

  // Resident routes: residents, admins, and super admins can view
  if (isResidentPath && !hasRole(payload.role, ['RESIDENT', 'ADMIN', 'SUPER_ADMIN'])) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Attach verified user information to request headers for downstream handlers
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-user-id', payload.sub);
  requestHeaders.set('x-user-role', payload.role);
  requestHeaders.set('x-user-phone', payload.phone);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/resident/:path*',
  ],
};
