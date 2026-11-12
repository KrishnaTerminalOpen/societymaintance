import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE_NAME } from '@/lib/auth';
import { cacheService } from '@colony/shared';

export async function POST(req: NextRequest) {
  try {
    const accessToken = req.cookies.get(ACCESS_COOKIE_NAME)?.value;
    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized: Please log in.' }, { status: 401 });
    }

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

    // Rate limiting: max 10 verify attempts per 60 seconds per IP
    const rateCheck = await cacheService.checkRateLimit({
      key: `payment:verify:${clientIp}`,
      limit: 10,
      windowSeconds: 60,
    });

    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many verification requests. Please wait a moment.' },
        {
          status: 429,
          headers: {
            'Retry-After': rateCheck.resetSeconds.toString(),
            'X-RateLimit-Limit': '10',
            'X-RateLimit-Remaining': '0',
          },
        },
      );
    }

    const body = await req.json();
    const apiUrl = process.env.API_URL || 'http://localhost:4000';

    const apiRes = await fetch(`${apiUrl}/api/v1/payments/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'x-forwarded-for': clientIp,
        'user-agent': req.headers.get('user-agent') || 'ColonyWeb',
      },
      body: JSON.stringify(body),
    });

    const data = await apiRes.json();
    return NextResponse.json(data, {
      status: apiRes.status,
      headers: {
        'X-RateLimit-Limit': '10',
        'X-RateLimit-Remaining': rateCheck.remaining.toString(),
      },
    });
  } catch (error) {
    console.error('Error in proxy /api/payments/verify:', error);
    return NextResponse.json(
      { error: 'Failed to contact payment engine. Please ensure API service is running.' },
      { status: 500 },
    );
  }
}
