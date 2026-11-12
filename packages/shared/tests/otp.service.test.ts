import { describe, it, expect, beforeEach } from 'vitest';
import { OtpService } from '../src/auth/otp.service';
import { InMemoryCacheStore } from '../src/auth/redis-store';
import { ISmsProvider, SmsDeliveryResult } from '../src/auth/sms/sms-provider.interface';

class MockSmsProvider implements ISmsProvider {
  name = 'MockSMS';
  sentMessages: Array<{ phone: string; otp: string }> = [];

  async sendOtp(phone: string, otp: string): Promise<SmsDeliveryResult> {
    this.sentMessages.push({ phone, otp });
    return {
      success: true,
      provider: this.name,
      messageId: `mock-${Date.now()}`,
    };
  }
}

describe('OtpService', () => {
  let cacheStore: InMemoryCacheStore;
  let mockSms: MockSmsProvider;
  let otpService: OtpService;
  const testPhone = '+919876543210';
  const testIp = '192.168.1.1';

  beforeEach(() => {
    cacheStore = new InMemoryCacheStore();
    mockSms = new MockSmsProvider();
    otpService = new OtpService(cacheStore, mockSms, {
      expirySeconds: 300,
      cooldownSeconds: 30,
      maxAttempts: 3,
      phoneRateLimitMax: 3,
      ipRateLimitMax: 5,
    });
  });

  it('generates a 6-digit OTP and hashes it in store', async () => {
    const res = await otpService.requestOtp(testPhone, testIp);
    expect(res.success).toBe(true);
    expect(mockSms.sentMessages.length).toBe(1);
    expect(mockSms.sentMessages[0].phone).toBe(testPhone);

    const sentOtp = mockSms.sentMessages[0].otp;
    expect(sentOtp).toMatch(/^\d{6}$/);

    // Ensure raw OTP is NEVER stored in Redis/cache, only its SHA-256 hash
    const storedHash = await cacheStore.get(`otp:hash:${testPhone}`);
    expect(storedHash).not.toBeNull();
    expect(storedHash).not.toBe(sentOtp);
    expect(storedHash).toBe(otpService.hashOtp(testPhone, sentOtp));
  });

  it('enforces 30-second resend cooldown', async () => {
    const firstReq = await otpService.requestOtp(testPhone, testIp);
    expect(firstReq.success).toBe(true);

    // Immediate second request must be rejected with remaining cooldown
    const secondReq = await otpService.requestOtp(testPhone, testIp);
    expect(secondReq.success).toBe(false);
    expect(secondReq.message).toContain('Please wait');
    expect(secondReq.cooldownSeconds).toBeGreaterThan(0);
  });

  it('successfully verifies correct OTP and clears it from cache', async () => {
    await otpService.requestOtp(testPhone, testIp);
    const sentOtp = mockSms.sentMessages[0].otp;

    const verifyResult = await otpService.verifyOtp(testPhone, sentOtp);
    expect(verifyResult.success).toBe(true);

    // Verifying again must fail because OTP was consumed
    const reVerify = await otpService.verifyOtp(testPhone, sentOtp);
    expect(reVerify.success).toBe(false);
  });

  it('tracks invalid attempts and locks after max 3 attempts', async () => {
    await otpService.requestOtp(testPhone, testIp);

    // Attempt 1: wrong code
    const att1 = await otpService.verifyOtp(testPhone, '000000');
    expect(att1.success).toBe(false);
    expect(att1.attemptsLeft).toBe(2);

    // Attempt 2: wrong code
    const att2 = await otpService.verifyOtp(testPhone, '111111');
    expect(att2.success).toBe(false);
    expect(att2.attemptsLeft).toBe(1);

    // Attempt 3: wrong code -> lockout
    const att3 = await otpService.verifyOtp(testPhone, '222222');
    expect(att3.success).toBe(false);
    expect(att3.attemptsLeft).toBe(0);

    // Even if user now provides the right code, it must be invalidated
    const correctOtp = mockSms.sentMessages[0].otp;
    const att4 = await otpService.verifyOtp(testPhone, correctOtp);
    expect(att4.success).toBe(false);
    expect(att4.error).toContain('expired or was not requested');
  });

  it('enforces rate limiting per phone number', async () => {
    // Service configured with phoneRateLimitMax = 3
    const p = '+919811199999';

    // 1st request
    const r1 = await otpService.requestOtp(p, '10.0.0.1');
    expect(r1.success).toBe(true);

    // Simulate cooldown expiry
    await cacheStore.del(`otp:cooldown:${p}`);

    // 2nd request
    const r2 = await otpService.requestOtp(p, '10.0.0.1');
    expect(r2.success).toBe(true);

    await cacheStore.del(`otp:cooldown:${p}`);

    // 3rd request
    const r3 = await otpService.requestOtp(p, '10.0.0.1');
    expect(r3.success).toBe(true);

    await cacheStore.del(`otp:cooldown:${p}`);

    // 4th request must exceed rate limit
    const r4 = await otpService.requestOtp(p, '10.0.0.1');
    expect(r4.success).toBe(false);
    expect(r4.message).toContain('Too many OTP requests for this phone number');
  });

  it('enforces rate limiting per IP address', async () => {
    // ipRateLimitMax = 5
    const attackerIp = '203.0.113.42';

    for (let i = 1; i <= 5; i++) {
      const phone = `+9198000000${i.toString().padStart(2, '0')}`;
      const res = await otpService.requestOtp(phone, attackerIp);
      expect(res.success).toBe(true);
    }

    // 6th request from same IP must be rejected
    const blockedPhone = '+919800000099';
    const blockedRes = await otpService.requestOtp(blockedPhone, attackerIp);
    expect(blockedRes.success).toBe(false);
    expect(blockedRes.message).toContain('Too many requests from this IP address');
  });
});

