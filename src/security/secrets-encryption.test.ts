import { describe, it, expect } from 'vitest';
import {
  encryptSecret,
  decryptSecret,
  isEncrypted,
  encryptSensitiveFields,
  decryptSensitiveFields,
} from './secrets-encryption.js';

describe('Phase 1: Secrets Encryption', () => {
  it('encrypts and decrypts strings', async () => {
    const plaintext = 'my-secret-token-12345678';
    const encrypted = await encryptSecret(plaintext);
    
    expect(encrypted).not.toBe(plaintext);
    expect(isEncrypted(encrypted)).toBe(true);
    
    const decrypted = await decryptSecret(encrypted);
    expect(decrypted).toBe(plaintext);
  });
  
  it('encrypted format is valid JSON', async () => {
    const encrypted = await encryptSecret('test');
    const parsed = JSON.parse(encrypted);
    
    expect(parsed.version).toBe(1);
    expect(parsed.algorithm).toBe('aes-256-gcm');
    expect(parsed.ciphertext).toBeDefined();
    expect(parsed.iv).toBeDefined();
    expect(parsed.authTag).toBeDefined();
    expect(parsed.salt).toBeDefined();
  });
  
  it('encrypts sensitive config fields', async () => {
    const config = {
      gateway: {
        auth: {
          token: 'plain-text-token-12345678901234',
        },
      },
    };
    
    const encrypted = await encryptSensitiveFields(config);
    expect(encrypted.gateway.auth.token).not.toBe('plain-text-token-12345678901234');
    expect(isEncrypted(encrypted.gateway.auth.token)).toBe(true);
    
    const decrypted = await decryptSensitiveFields(encrypted);
    expect(decrypted.gateway.auth.token).toBe('plain-text-token-12345678901234');
  });
  
  it('handles already encrypted fields (idempotent)', async () => {
    const encrypted = await encryptSecret('test-secret-32-characters-long-abc');
    const config = { gateway: { auth: { token: encrypted } } };
    
    const reencrypted = await encryptSensitiveFields(config);
    expect(reencrypted.gateway.auth.token).toBe(encrypted); // Should not double-encrypt
  });
  
  it('encrypts channel tokens', async () => {
    const config = {
      channels: {
        telegram: {
          token: 'telegram-bot-token-123456',
        },
      },
    };
    
    const encrypted = await encryptSensitiveFields(config);
    expect(isEncrypted(encrypted.channels.telegram.token)).toBe(true);
    
    const decrypted = await decryptSensitiveFields(encrypted);
    expect(decrypted.channels.telegram.token).toBe('telegram-bot-token-123456');
  });
  
  it('encrypts nested account tokens', async () => {
    const config = {
      channels: {
        slack: {
          accounts: {
            default: {
              botToken: 'xoxb-bot-token',
              appToken: 'xapp-app-token',
            },
          },
        },
      },
    };
    
    const encrypted = await encryptSensitiveFields(config);
    expect(isEncrypted(encrypted.channels.slack.accounts.default.botToken)).toBe(true);
    expect(isEncrypted(encrypted.channels.slack.accounts.default.appToken)).toBe(true);
  });
  
  it('tamper detection - fails on modified ciphertext', async () => {
    const encrypted = await encryptSecret('secret');
    const parsed = JSON.parse(encrypted);
    
    // Tamper with ciphertext
    parsed.ciphertext = parsed.ciphertext.slice(0, -5) + 'XXXXX';
    const tampered = JSON.stringify(parsed);
    
    await expect(decryptSecret(tampered)).rejects.toThrow();
  });
});
