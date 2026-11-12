import { describe, it, expect } from 'vitest';
import { encryptField, decryptField } from '../src/security/encryption';

describe('Field Level AES-256-GCM Encryption', () => {
  it('should encrypt and successfully decrypt sensitive plaintext', () => {
    const sensitiveData = '9876543210:HDFC0001234:SAVINGS';
    const encrypted = encryptField(sensitiveData);

    expect(encrypted).not.toBe(sensitiveData);
    expect(encrypted.startsWith('enc:v1:')).toBe(true);

    const decrypted = decryptField(encrypted);
    expect(decrypted).toBe(sensitiveData);
  });

  it('should safely return plaintext if already unencrypted or invalid', () => {
    const plain = 'unencrypted_string';
    expect(decryptField(plain)).toBe(plain);
  });

  it('should produce different ciphertexts for the same plaintext due to random IV', () => {
    const secret = 'ColonySecretKey123';
    const enc1 = encryptField(secret);
    const enc2 = encryptField(secret);

    expect(enc1).not.toBe(enc2);
    expect(decryptField(enc1)).toBe(secret);
    expect(decryptField(enc2)).toBe(secret);
  });
});

