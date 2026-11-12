import { SignJWT, jwtVerify } from 'jose';
import { JwtAccessTokenPayload, JwtRefreshTokenPayload } from './types';

const DEFAULT_ACCESS_SECRET = 'colony-deposit-dev-jwt-access-secret-key-32chars';
const DEFAULT_REFRESH_SECRET = 'colony-deposit-dev-jwt-refresh-secret-key-32chars';

function getAccessKey(secret?: string): Uint8Array {
  const secretStr = secret || process.env.JWT_ACCESS_SECRET || DEFAULT_ACCESS_SECRET;
  return new TextEncoder().encode(secretStr);
}

function getRefreshKey(secret?: string): Uint8Array {
  const secretStr = secret || process.env.JWT_REFRESH_SECRET || DEFAULT_REFRESH_SECRET;
  return new TextEncoder().encode(secretStr);
}

export async function signAccessToken(
  payload: Omit<JwtAccessTokenPayload, 'iat' | 'exp'>,
  options?: { secret?: string; expiresIn?: string },
): Promise<string> {
  const key = getAccessKey(options?.secret);
  const expiresIn = options?.expiresIn || process.env.JWT_ACCESS_EXPIRES_IN || '15m';

  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

export async function signRefreshToken(
  payload: Omit<JwtRefreshTokenPayload, 'iat' | 'exp'>,
  options?: { secret?: string; expiresIn?: string },
): Promise<string> {
  const key = getRefreshKey(options?.secret);
  const expiresIn = options?.expiresIn || process.env.JWT_REFRESH_EXPIRES_IN || '7d';

  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

export async function verifyAccessToken(
  token: string,
  secret?: string,
): Promise<JwtAccessTokenPayload | null> {
  try {
    const key = getAccessKey(secret);
    const { payload } = await jwtVerify(token, key);
    return payload as unknown as JwtAccessTokenPayload;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(
  token: string,
  secret?: string,
): Promise<JwtRefreshTokenPayload | null> {
  try {
    const key = getRefreshKey(secret);
    const { payload } = await jwtVerify(token, key);
    return payload as unknown as JwtRefreshTokenPayload;
  } catch {
    return null;
  }
}

