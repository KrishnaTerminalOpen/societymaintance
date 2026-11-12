import { UserRole } from '../schemas/user.schema';

export interface AuthUser {
  id: string;
  phone: string;
  name: string;
  role: UserRole;
  status: string;
}

export interface JwtAccessTokenPayload {
  sub: string; // User ID
  phone: string;
  role: UserRole;
  name: string;
  sessionId: string;
  iat?: number;
  exp?: number;
}

export interface JwtRefreshTokenPayload {
  sub: string; // User ID
  sessionId: string;
  tokenVersion: number;
  iat?: number;
  exp?: number;
}

export interface OtpVerificationResult {
  success: boolean;
  user?: AuthUser;
  error?: string;
  attemptsLeft?: number;
  cooldownSeconds?: number;
  rateLimited?: boolean;
}

export interface SendOtpResult {
  success: boolean;
  cooldownSeconds: number;
  message: string;
  devOtp?: string; // Included only in development mode
}
