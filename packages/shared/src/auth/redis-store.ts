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
 * Real Redis implementation wrapping ioredis with automatic In-Memory fallback
 * whenever Redis is unreachable or offline.
 */
export class RedisCacheStore implements ICacheStore {
  private useFallback = false;
  private warnedFallback = false;

  constructor(
    private client: Redis,
    private fallback: ICacheStore = new InMemoryCacheStore(),
  ) {
    if (typeof (this.client as unknown as { on?: unknown }).on === 'function') {
      this.client.on('error', (err) => {
        this.activateFallback(err);
      });
      this.client.on('ready', () => {
        this.useFallback = false;
      });
    }
  }

  private activateFallback(err?: unknown): void {
    this.useFallback = true;
    if (!this.warnedFallback) {
      this.warnedFallback = true;
      const msg = err instanceof Error ? err.message : String(err || 'Connection unavailable');
      console.warn('⚠️ Redis unreachable, falling back to In-Memory cache store:', msg);
    }
  }

  private async withFallback<T>(
    redisOp: () => Promise<T>,
    fallbackOp: () => Promise<T>,
  ): Promise<T> {
    const status = (this.client as unknown as { status?: string }).status;
    if (this.useFallback || status === 'end') {
      return fallbackOp();
    }

    try {
      const connectFn = (this.client as unknown as { connect?: () => Promise<void> }).connect;
      if (status === 'wait' && typeof connectFn === 'function') {
        await connectFn.call(this.client);
      }
      return await redisOp();
    } catch (err) {
      this.activateFallback(err);
      return fallbackOp();
    }
  }

  async get(key: string): Promise<string | null> {
    return this.withFallback(
      () => this.client.get(key),
      () => this.fallback.get(key),
    );
  }

  async setex(key: string, seconds: number, value: string): Promise<void> {
    await this.withFallback<void>(
      async () => {
        await this.client.setex(key, seconds, value);
      },
      () => this.fallback.setex(key, seconds, value),
    );
  }

  async del(key: string): Promise<void> {
    await this.withFallback<void>(
      async () => {
        await this.client.del(key);
      },
      () => this.fallback.del(key),
    );
  }

  async incr(key: string): Promise<number> {
    return this.withFallback<number>(
      () => this.client.incr(key),
      () => this.fallback.incr(key),
    );
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.withFallback<void>(
      async () => {
        await this.client.expire(key, seconds);
      },
      () => this.fallback.expire(key, seconds),
    );
  }

  async ttl(key: string): Promise<number> {
    return this.withFallback<number>(
      () => this.client.ttl(key),
      () => this.fallback.ttl(key),
    );
  }

  async flush(): Promise<void> {
    await this.withFallback<void>(
      async () => {
        await this.client.flushdb();
      },
      () => this.fallback.flush(),
    );
  }
}

const globalForCache = globalThis as unknown as {
  __colonyCacheStore?: ICacheStore;
};

let activeStore: ICacheStore | null = globalForCache.__colonyCacheStore ?? null;

export function getCacheStore(): ICacheStore {
  if (activeStore) {
    return activeStore;
  }

  const redisUrl = process.env.REDIS_URL;
  const isTest = process.env.NODE_ENV === 'test';
  const fallbackStore = new InMemoryCacheStore();

  if (!redisUrl || isTest) {
    activeStore = fallbackStore;
    globalForCache.__colonyCacheStore = activeStore;
    return activeStore;
  }

  try {
    const redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 1000,
      lazyConnect: true,
      retryStrategy: () => null,
    });

    activeStore = new RedisCacheStore(redis, fallbackStore);
    globalForCache.__colonyCacheStore = activeStore;
    return activeStore;
  } catch {
    activeStore = fallbackStore;
    globalForCache.__colonyCacheStore = activeStore;
    return activeStore;
  }
}

export function setCacheStore(store: ICacheStore): void {
  activeStore = store;
  globalForCache.__colonyCacheStore = store;
}
