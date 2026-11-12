import { BrowserContext } from '@playwright/test';
import { SignJWT } from 'jose';

const DEFAULT_ACCESS_SECRET = 'colony-e2e-deterministic-jwt-secret-32chars!';

export async function injectAuthCookie(
  context: BrowserContext,
  role: 'RESIDENT' | 'ADMIN' | 'SUPER_ADMIN',
  userId = 'usr_e2e_1',
  phone = '9811122233',
) {
  const secretStr = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || DEFAULT_ACCESS_SECRET;
  const key = new TextEncoder().encode(secretStr);

  const token = await new SignJWT({
    sub: userId,
    phone,
    role,
    name: role === 'RESIDENT' ? 'Priya Sharma' : 'Estate Manager',
    sessionId: 'sess_e2e_mock',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);

  await context.addCookies([
    {
      name: 'colony_access_token',
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

