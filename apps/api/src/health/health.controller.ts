import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { prisma } from '@colony/database';
import { getCacheStore } from '@colony/shared';

@Controller('health')
export class HealthController {
  @Get()
  async check() {
    let dbStatus = 'down';
    let redisStatus = 'down';

    // 1. Database connectivity check
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'up';
    } catch {
      // In dev or test if DB not spun up, report degraded
      dbStatus = 'degraded';
    }

    // 2. Redis cache check
    try {
      const cache = getCacheStore();
      await cache.get('health_ping');
      redisStatus = 'up';
    } catch {
      redisStatus = 'degraded';
    }

    const isHealthy = dbStatus !== 'down' && redisStatus !== 'down';

    const healthData = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        redis: redisStatus,
      },
      environment: process.env.NODE_ENV || 'development',
    };

    if (!isHealthy) {
      throw new ServiceUnavailableException(healthData);
    }

    return healthData;
  }
}
