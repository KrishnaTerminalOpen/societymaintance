import { NextResponse } from 'next/server';
import { prisma } from '@colony/database';
import { getCacheStore } from '@colony/shared';

export const dynamic = 'force-dynamic';

export async function GET() {
  let dbStatus = 'down';
  let cacheStatus = 'down';

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'up';
  } catch {
    dbStatus = 'degraded';
  }

  try {
    const cache = getCacheStore();
    await cache.get('web_health_ping');
    cacheStatus = 'up';
  } catch {
    cacheStatus = 'degraded';
  }

  const isHealthy = dbStatus !== 'down' && cacheStatus !== 'down';

  return NextResponse.json(
    {
      status: isHealthy ? 'healthy' : 'degraded',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        cache: cacheStatus,
      },
      environment: process.env.NODE_ENV || 'development',
    },
    {
      status: isHealthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    },
  );
}

