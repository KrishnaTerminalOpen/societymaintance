import { randomUUID } from 'crypto';
import { ICacheStore, getCacheStore } from './redis-store';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from './jwt';
import { AuthUser, JwtAccessTokenPayload } from './types';

export interface UserSessionData {
  userId: string;
  phone: string;
  role: string;
  tokenVersion: number;
  ipAddress?: string;
  userAgent?: string;
  createdAt: number;
}

export class SessionService {
  private cache: ICacheStore;
  private refreshExpirySeconds = 7 * 24 * 60 * 60; // 7 days

  constructor(cacheStore?: ICacheStore) {
    this.cache = cacheStore || getCacheStore();
  }

  /**
   * Creates a new user session with rotating tokens and stores session state in Redis.
   */
  async createSession(
    user: AuthUser,
    clientMeta?: { ipAddress?: string; userAgent?: string },
  ): Promise<{ accessToken: string; refreshToken: string; sessionId: string }> {
    const sessionId = randomUUID();
    const tokenVersion = 1;

    const sessionData: UserSessionData = {
      userId: user.id,
      phone: user.phone,
      role: user.role,
      tokenVersion,
      ipAddress: clientMeta?.ipAddress,
      userAgent: clientMeta?.userAgent,
      createdAt: Date.now(),
    };

    const sessionKey = `session:${user.id}:${sessionId}`;
    await this.cache.setex(sessionKey, this.refreshExpirySeconds, JSON.stringify(sessionData));

    // Sign JWTs
    const accessToken = await signAccessToken({
      sub: user.id,
      phone: user.phone,
      role: user.role,
      name: user.name,
      sessionId,
    });

    const refreshToken = await signRefreshToken({
      sub: user.id,
      sessionId,
      tokenVersion,
    });

    return { accessToken, refreshToken, sessionId };
  }

  /**
   * Rotates a refresh token: verifies old token, validates session in Redis,
   * increments tokenVersion, issues new access token + new rotating refresh token.
   */
  async rotateRefreshToken(
    oldRefreshToken: string,
    userFetchFn: (userId: string) => Promise<AuthUser | null>,
  ): Promise<{ accessToken: string; refreshToken: string } | null> {
    const payload = await verifyRefreshToken(oldRefreshToken);
    if (!payload || !payload.sub || !payload.sessionId) {
      return null;
    }

    const sessionKey = `session:${payload.sub}:${payload.sessionId}`;
    const rawSession = await this.cache.get(sessionKey);
    if (!rawSession) {
      return null;
    }

    const sessionData = JSON.parse(rawSession) as UserSessionData;

    // Detect token reuse / invalidation
    if (sessionData.tokenVersion !== payload.tokenVersion) {
      // Possible token theft! Invalidate this session immediately.
      await this.cache.del(sessionKey);
      return null;
    }

    const user = await userFetchFn(payload.sub);
    if (!user || user.status !== 'ACTIVE') {
      await this.cache.del(sessionKey);
      return null;
    }

    // Increment token version (rotation)
    sessionData.tokenVersion += 1;
    await this.cache.setex(sessionKey, this.refreshExpirySeconds, JSON.stringify(sessionData));

    const newAccessToken = await signAccessToken({
      sub: user.id,
      phone: user.phone,
      role: user.role,
      name: user.name,
      sessionId: payload.sessionId,
    });

    const newRefreshToken = await signRefreshToken({
      sub: user.id,
      sessionId: payload.sessionId,
      tokenVersion: sessionData.tokenVersion,
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Ends a single session (Logout)
   */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const sessionKey = `session:${userId}:${sessionId}`;
    await this.cache.del(sessionKey);
  }

  /**
   * Validates if an access token's session is still active in Redis
   */
  async isSessionActive(payload: JwtAccessTokenPayload): Promise<boolean> {
    const sessionKey = `session:${payload.sub}:${payload.sessionId}`;
    const raw = await this.cache.get(sessionKey);
    return raw !== null;
  }
}

let defaultSessionService: SessionService | null = null;

export function getSessionService(): SessionService {
  if (!defaultSessionService) {
    defaultSessionService = new SessionService();
  }
  return defaultSessionService;
}

