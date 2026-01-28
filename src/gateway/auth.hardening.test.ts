import { describe, it, expect } from 'vitest';
import { validateGatewayAuthToken, resolveGatewayAuth } from './auth.js';

describe('Phase 1: Auth Token Validation', () => {
  it('rejects tokens shorter than 32 characters', () => {
    const result = validateGatewayAuthToken('short-token-24-chars-abc');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('32 characters');
  });
  
  it('rejects tokens with low entropy', () => {
    const result = validateGatewayAuthToken('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'); // 32 'a's
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('entropy');
  });
  
  it('accepts strong 32-char token', () => {
    const result = validateGatewayAuthToken('abcdefghijklmnopqrstuvwxyz123456');
    expect(result.valid).toBe(true);
  });
  
  it('accepts token with high entropy', () => {
    const result = validateGatewayAuthToken('a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6');
    expect(result.valid).toBe(true);
  });
  
  it('throws on invalid token in resolveGatewayAuth', () => {
    expect(() => {
      resolveGatewayAuth({
        authConfig: { token: 'short' },
        env: {},
      });
    }).toThrow('Invalid gateway token');
  });
  
  it('allows valid token through resolveGatewayAuth', () => {
    const result = resolveGatewayAuth({
      authConfig: { token: 'valid-32-character-token-abcdef12' },
      env: {},
    });
    
    expect(result.mode).toBe('token');
    expect(result.token).toBe('valid-32-character-token-abcdef12');
  });
});
