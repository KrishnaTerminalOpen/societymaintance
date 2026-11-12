import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ACCESS_COOKIE_NAME } from '@/lib/auth';
import { cacheService, AppLogger, SentryTracker } from '@colony/shared';

const CreateOrderRequestSchema = z.object({
  depositId: z.string().min(1, 'Deposit ID is required').max(128),
  requestedAmountPaise: z.number().int().positive().optional(),
  idempotencyKey: z.string().min(8).max(128),
  method: z.enum(['UPI', 'CARD', 'NETBANKING', 'WALLET']).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const accessToken = req.cookies.get(ACCESS_COOKIE_NAME)?.value;
    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized: Please log in.' }, { status: 401 });
    }

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

    // Rate limiting: max 10 order creations per 60 seconds per IP
    const rateCheck = await cacheService.checkRateLimit({
      key: `payment:create-order:${clientIp}`,
      limit: 10,
      windowSeconds: 60,
    });

    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many payment requests. Please wait a moment before trying again.' },
        {
          status: 429,
          headers: {
            'Retry-After': rateCheck.resetSeconds.toString(),
            'X-RateLimit-Limit': '10',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateCheck.resetSeconds.toString(),
          },
        },
      );
    }

    const body = await req.json();
    const parsed = CreateOrderRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payment order request', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const apiUrl = process.env.API_URL || 'http://localhost:4000';

    const apiRes = await fetch(`${apiUrl}/api/v1/payments/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'x-forwarded-for': clientIp,
        'user-agent': req.headers.get('user-agent') || 'ColonyWeb',
      },
      body: JSON.stringify(parsed.data),
    });

    const data = await apiRes.json();
    return NextResponse.json(data, {
      status: apiRes.status,
      headers: {
        'X-RateLimit-Limit': '10',
        'X-RateLimit-Remaining': rateCheck.remaining.toString(),
        'X-RateLimit-Reset': rateCheck.resetSeconds.toString(),
      },
    });
  } catch (error) {
    AppLogger.error('Error in proxy /api/payments/create-order', { context: 'PaymentsProxy', error });
    SentryTracker.captureException(error, { route: '/api/payments/create-order' });
    return NextResponse.json(
      { error: 'Failed to contact payment engine. Please ensure API service is running.' },
      { status: 500 },
    );
  }
}
