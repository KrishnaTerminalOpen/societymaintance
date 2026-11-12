import Redis from 'ioredis';

export interface ICacheStore {
  get(key: string): Promise<string | null>;
  setex(key: string, seconds: number, value: string): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
  ttl(key: string): Promise<number>;
  flush(): Promise<void>;
}

/**
 * Resilient In-Memory Cache Store with TTL cleanup.
 * Used for unit testing and local development when Redis server is offline.
 */
export class InMemoryCacheStore implements ICacheStore {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async setex(key: string, seconds: number, value: string): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + seconds * 1000,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async incr(key: string): Promise<number> {
    const current = await this.get(key);
    const newVal = current ? parseInt(current, 10) + 1 : 1;
    const item = this.store.get(key);
    const ttlMs = item ? item.expiresAt - Date.now() : 3600 * 1000;
    this.store.set(key, {
      value: newVal.toString(),
      expiresAt: Date.now() + (ttlMs > 0 ? ttlMs : 3600 * 1000),
    });
    return newVal;
  }

  async expire(key: string, seconds: number): Promise<void> {
    const item = this.store.get(key);
    if (item) {
      item.expiresAt = Date.now() + seconds * 1000;
    }
  }

  async ttl(key: string): Promise<number> {
    const item = this.store.get(key);
    if (!item) return -2;
    const remainingMs = item.expiresAt - Date.now();
    if (remainingMs <= 0) {
      this.store.delete(key);
      return -2;
    }
    return Math.ceil(remainingMs / 1000);
  }

  async flush(): Promise<void> {
    this.store.clear();
  }
}

/**
 * Real Redis implementation wrapping ioredis
 */
export class RedisCacheStore implements ICacheStore {
  constructor(private client: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async setex(key: string, seconds: number, value: string): Promise<void> {
    await this.client.setex(key, seconds, value);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.client.expire(key, seconds);
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async flush(): Promise<void> {
    await this.client.flushdb();
  }
}

let activeStore: ICacheStore | null = null;

export function getCacheStore(): ICacheStore {
  if (activeStore) {
    return activeStore;
  }

  const redisUrl = process.env.REDIS_URL;
  const isTest = process.env.NODE_ENV === 'test';

  if (!redisUrl || isTest) {
    activeStore = new InMemoryCacheStore();
    return activeStore;
  }

  try {
    const redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
      lazyConnect: true,
    });

    redis.on('error', (err) => {
      if (!activeStore || !(activeStore instanceof InMemoryCacheStore)) {
        console.warn('⚠️ Redis unreachable, falling back to In-Memory cache store:', err.message);
        activeStore = new InMemoryCacheStore();
      }
    });

    activeStore = new RedisCacheStore(redis);
    return activeStore;
  } catch {
    activeStore = new InMemoryCacheStore();
    return activeStore;
  }
}

export function setCacheStore(store: ICacheStore): void {
  activeStore = store;
}
