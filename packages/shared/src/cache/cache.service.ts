import { getCacheStore, ICacheStore } from '../auth/redis-store';

/**
 * Safely serializes data including BigInt values.
 */
function serialize<T>(data: T): string {
  return JSON.stringify(data, (_, value) =>
    typeof value === 'bigint' ? { __type: 'bigint', value: value.toString() } : value,
  );
}

/**
 * Safely parses JSON restoring BigInt instances.
 */
function deserialize<T>(jsonStr: string): T {
  return JSON.parse(jsonStr, (_, value) => {
    if (value && typeof value === 'object' && value.__type === 'bigint') {
      return BigInt(value.value);
    }
    return value;
  });
}

export class CacheService {
  constructor(private store: ICacheStore = getCacheStore()) {}

  /**
   * Retrieves an item from cache.
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.store.get(key);
      if (!raw) return null;
      return deserialize<T>(raw);
    } catch {
      return null;
    }
  }

  /**
   * Sets an item in cache with a TTL (defaults to 60 seconds).
   */
  async set<T>(key: string, value: T, ttlSeconds: number = 60): Promise<void> {
    try {
      const serialized = serialize(value);
      await this.store.setex(key, ttlSeconds, serialized);
    } catch (err) {
      // Non-fatal cache failure
    }
  }

  /**
   * Deletes a cache entry.
   */
  async del(key: string): Promise<void> {
    try {
      await this.store.del(key);
    } catch {}
  }

  /**
   * Deletes multiple keys.
   */
  async delMany(keys: string[]): Promise<void> {
    try {
      await Promise.all(keys.map((k) => this.store.del(k)));
    } catch {}
  }

  /**
   * Transparent Cache-Aside helper: returns cached value or executes factory function.
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds: number = 60,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }
    const fresh = await factory();
    if (fresh !== undefined && fresh !== null) {
      await this.set(key, fresh, ttlSeconds);
    }
    return fresh;
  }

  /**
   * Sliding window / Fixed window rate limiting helper using Redis.
   */
  async checkRateLimit(options: {
    key: string;
    limit: number;
    windowSeconds: number;
  }): Promise<{ allowed: boolean; remaining: number; resetSeconds: number }> {
    const { key, limit, windowSeconds } = options;
    const rateLimitKey = `ratelimit:${key}`;

    try {
      const count = await this.store.incr(rateLimitKey);
      if (count === 1) {
        await this.store.expire(rateLimitKey, windowSeconds);
      }

      let ttl = await this.store.ttl(rateLimitKey);
      if (ttl <= 0) ttl = windowSeconds;

      const remaining = Math.max(0, limit - count);
      return {
        allowed: count <= limit,
        remaining,
        resetSeconds: ttl,
      };
    } catch {
      // In case of cache store failure, fail open to avoid rejecting legitimate traffic
      return {
        allowed: true,
        remaining: limit,
        resetSeconds: windowSeconds,
      };
    }
  }
}

/**
 * Standardized ColonyDeposit Cache Keys & Invalidation Routines
 */
export const CacheKeys = {
  settings: () => 'colony:settings:global',
  adminDashboard: () => 'colony:admin:dashboard:stats',
  residentDashboard: (userId: string) => `colony:resident:dashboard:${userId}`,
  residentPayments: (userId: string) => `colony:resident:payments:${userId}`,
  reconciliationReport: () => 'colony:reconciliation:report',
};

export const cacheService = new CacheService();

/**
 * Invalidation helpers called across payment mutations, refunds, and settings updates.
 */
export async function invalidateDashboardCaches(userId?: string): Promise<void> {
  const keys = [CacheKeys.adminDashboard(), CacheKeys.reconciliationReport()];
  if (userId) {
    keys.push(CacheKeys.residentDashboard(userId), CacheKeys.residentPayments(userId));
  }
  await cacheService.delMany(keys);
}

export async function invalidateSettingsCache(): Promise<void> {
  await cacheService.del(CacheKeys.settings());
  await cacheService.del(CacheKeys.adminDashboard());
}
