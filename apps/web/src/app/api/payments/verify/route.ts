import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE_NAME } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const accessToken = req.cookies.get(ACCESS_COOKIE_NAME)?.value;
    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized: Please log in.' }, { status: 401 });
    }

    const body = await req.json();
    const apiUrl = process.env.API_URL || 'http://localhost:4000';

    const apiRes = await fetch(`${apiUrl}/api/v1/payments/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'x-forwarded-for': req.headers.get('x-forwarded-for') || '127.0.0.1',
        'user-agent': req.headers.get('user-agent') || 'ColonyWeb',
      },
      body: JSON.stringify(body),
    });

    const data = await apiRes.json();
    return NextResponse.json(data, { status: apiRes.status });
  } catch (error) {
    console.error('Error in proxy /api/payments/verify:', error);
    return NextResponse.json(
      { error: 'Failed to contact payment engine. Please ensure API service is running.' },
      { status: 500 },
    );
  }
}
