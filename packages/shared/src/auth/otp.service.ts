import { createHash, randomInt } from 'crypto';
import { ICacheStore, getCacheStore } from './redis-store';
import { ISmsProvider } from './sms/sms-provider.interface';
import { getSmsProvider } from './sms/sms-provider.factory';
import { SendOtpResult, OtpVerificationResult } from './types';

export interface OtpServiceConfig {
  otpLength?: number;
  expirySeconds?: number;
  maxAttempts?: number;
  cooldownSeconds?: number;
  phoneRateLimitMax?: number;
  phoneRateLimitWindowSeconds?: number;
  ipRateLimitMax?: number;
  ipRateLimitWindowSeconds?: number;
  hashSecret?: string;
}

export class OtpService {
  private cache: ICacheStore;
  private explicitSmsProvider?: ISmsProvider;
  private config: Required<OtpServiceConfig>;

  constructor(
    cacheStore?: ICacheStore,
    smsProvider?: ISmsProvider,
    customConfig?: OtpServiceConfig,
  ) {
    this.cache = cacheStore || getCacheStore();
    this.explicitSmsProvider = smsProvider;
    this.config = {
      otpLength: 6,
      expirySeconds: 300, // 5 minutes
      maxAttempts: 3,
      cooldownSeconds: 30, // 30s resend cooldown
      phoneRateLimitMax: 5,
      phoneRateLimitWindowSeconds: 600, // 5 requests per 10 mins
      ipRateLimitMax: 25,
      ipRateLimitWindowSeconds: 600, // 25 requests per 10 mins per IP
      hashSecret: process.env.JWT_ACCESS_SECRET || 'colonydeposit-otp-hash-salt-2026',
      ...customConfig,
    };
  }

  /**
   * Hashes the 6-digit OTP combined with phone and secret salt using SHA-256.
   */
  hashOtp(phone: string, otp: string): string {
    return createHash('sha256')
      .update(`${phone}:${otp}:${this.config.hashSecret}`)
      .digest('hex');
  }

  /**
   * Generates a cryptographically secure 6-digit numeric OTP.
   */
  generateOtp(): string {
    const min = Math.pow(10, this.config.otpLength - 1);
    const max = Math.pow(10, this.config.otpLength) - 1;
    return randomInt(min, max + 1).toString();
  }

  /**
   * Generates, stores, and dispatches a 6-digit OTP.
   */
  async requestOtp(phone: string, clientIp: string): Promise<SendOtpResult> {
    const cleanPhone = phone.trim();
    const cleanIp = (clientIp || '127.0.0.1').trim();

    // 1. Rate Limiting per IP
    const ipKey = `ratelimit:ip:${cleanIp}`;
    const ipRequests = await this.cache.incr(ipKey);
    if (ipRequests === 1) {
      await this.cache.expire(ipKey, this.config.ipRateLimitWindowSeconds);
    }
    if (ipRequests > this.config.ipRateLimitMax) {
      return {
        success: false,
        cooldownSeconds: await this.cache.ttl(ipKey),
        message: 'Too many requests from this IP address. Please wait before retrying.',
      };
    }

    // 2. Rate Limiting per Phone
    const phoneRateKey = `ratelimit:phone:${cleanPhone}`;
    const phoneRequests = await this.cache.incr(phoneRateKey);
    if (phoneRequests === 1) {
      await this.cache.expire(phoneRateKey, this.config.phoneRateLimitWindowSeconds);
    }
    if (phoneRequests > this.config.phoneRateLimitMax) {
      return {
        success: false,
        cooldownSeconds: await this.cache.ttl(phoneRateKey),
        message: 'Too many OTP requests for this phone number. Please wait before retrying.',
      };
    }

    // 3. Resend Cooldown Check (30 seconds)
    const cooldownKey = `otp:cooldown:${cleanPhone}`;
    const currentCooldown = await this.cache.ttl(cooldownKey);
    if (currentCooldown > 0) {
      return {
        success: false,
        cooldownSeconds: currentCooldown,
        message: `Please wait ${currentCooldown} seconds before requesting a new OTP.`,
      };
    }

    // 4. Generate 6-digit OTP & Hash
    const otp = this.generateOtp();
    const hashed = this.hashOtp(cleanPhone, otp);

    // 5. Store in Redis with 5-minute expiry & reset attempts
    const hashKey = `otp:hash:${cleanPhone}`;
    const attemptsKey = `otp:attempts:${cleanPhone}`;

    await this.cache.setex(hashKey, this.config.expirySeconds, hashed);
    await this.cache.setex(attemptsKey, this.config.expirySeconds, '0');
    await this.cache.setex(cooldownKey, this.config.cooldownSeconds, 'active');

    // 6. Send OTP via Swappable SMS Provider (Twilio / MSG91 / Fast2SMS / Dev Console)
    const activeProvider = this.explicitSmsProvider || getSmsProvider();
    const sendResult = await activeProvider.sendOtp(cleanPhone, otp);
    if (!sendResult.success) {
      // Clean up stored OTP if dispatch failed
      await this.cache.del(hashKey);
      await this.cache.del(attemptsKey);
      await this.cache.del(cooldownKey);
      return {
        success: false,
        cooldownSeconds: 0,
        message: sendResult.error || 'Failed to dispatch OTP via SMS provider',
      };
    }

    const isDev = process.env.NODE_ENV !== 'production';
    const isDemoConsole = activeProvider.name === 'DevConsole';

    return {
      success: true,
      cooldownSeconds: this.config.cooldownSeconds,
      message: isDemoConsole
        ? 'Dev OTP generated (SMS provider in console mode).'
        : `OTP sent via ${activeProvider.name} to your mobile number.`,
      devOtp: isDev && isDemoConsole ? otp : undefined,
    };
  }

  /**
   * Verifies the user-entered 6-digit OTP against the stored hash in Redis.
   */
  async verifyOtp(phone: string, enteredOtp: string): Promise<OtpVerificationResult> {
    const cleanPhone = phone.trim();
    const cleanOtp = enteredOtp.trim();

    const hashKey = `otp:hash:${cleanPhone}`;
    const attemptsKey = `otp:attempts:${cleanPhone}`;

    // 1. Fetch stored hash
    const storedHash = await this.cache.get(hashKey);
    if (!storedHash) {
      return {
        success: false,
        error: 'OTP has expired or was not requested. Please request a new code.',
        attemptsLeft: 0,
      };
    }

    // 2. Increment attempt counter
    const currentAttempts = await this.cache.incr(attemptsKey);

    if (currentAttempts > this.config.maxAttempts) {
      // Invalidate the OTP immediately if maximum attempts exceeded
      await this.cache.del(hashKey);
      await this.cache.del(attemptsKey);
      return {
        success: false,
        error: 'Maximum OTP attempts exceeded. Please request a new OTP.',
        attemptsLeft: 0,
      };
    }

    // 3. Verify OTP hash
    const enteredHash = this.hashOtp(cleanPhone, cleanOtp);

    if (enteredHash !== storedHash) {
      const remainingAttempts = Math.max(0, this.config.maxAttempts - currentAttempts);
      if (remainingAttempts === 0) {
        await this.cache.del(hashKey);
        await this.cache.del(attemptsKey);
      }
      return {
        success: false,
        error:
          remainingAttempts > 0
            ? `Invalid OTP. You have ${remainingAttempts} attempt(s) remaining.`
            : 'Maximum OTP attempts reached. Please request a new code.',
        attemptsLeft: remainingAttempts,
      };
    }

    // 4. Success: Clean up OTP & attempts keys
    await this.cache.del(hashKey);
    await this.cache.del(attemptsKey);
    const cooldownKey = `otp:cooldown:${cleanPhone}`;
    await this.cache.del(cooldownKey);

    return {
      success: true,
    };
  }

  /**
   * Invalidates any active OTP for a phone number immediately.
   */
  async invalidateOtp(phone: string): Promise<void> {
    const cleanPhone = phone.trim();
    await this.cache.del(`otp:hash:${cleanPhone}`);
    await this.cache.del(`otp:attempts:${cleanPhone}`);
    await this.cache.del(`otp:cooldown:${cleanPhone}`);
  }
}

let defaultOtpService: OtpService | null = null;

export function getOtpService(): OtpService {
  if (!defaultOtpService) {
    defaultOtpService = new OtpService();
  }
  return defaultOtpService;
}

