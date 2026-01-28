import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuthRateLimiter } from './rate-limiter.js';

describe('Phase 1: Auth Rate Limiter', () => {
  let limiter: AuthRateLimiter;
  
  beforeEach(() => {
    limiter = new AuthRateLimiter();
  });
  
  afterEach(() => {
    limiter.destroy();
  });
  
  it('allows first 5 attempts', () => {
    const ip = '192.168.1.1';
    
    for (let i = 0; i < 5; i++) {
      const result = limiter.check(ip);
      expect(result.allowed).toBe(true);
      limiter.record(ip, false);
    }
  });
  
  it('blocks 6th attempt', () => {
    const ip = '192.168.1.1';
    
    for (let i = 0; i < 5; i++) {
      limiter.check(ip);
      limiter.record(ip, false);
    }
    
    const result = limiter.check(ip);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });
  
  it('resets on successful auth', () => {
    const ip = '192.168.1.1';
    
    for (let i = 0; i < 4; i++) {
      limiter.check(ip);
      limiter.record(ip, false);
    }
    
    limiter.record(ip, true); // Success resets
    
    const result = limiter.check(ip);
    expect(result.allowed).toBe(true);
  });
  
  it('tracks different IPs independently', () => {
    limiter.check('10.0.0.1');
    limiter.record('10.0.0.1', false);
    
    limiter.check('10.0.0.2');
    limiter.record('10.0.0.2', false);
    
    const attempts = limiter.getAttempts();
    expect(attempts.size).toBe(2);
  });
  
  it('cleans up expired entries', () => {
    const ip = '192.168.1.1';
    limiter.check(ip);
    limiter.record(ip, false);
    
    limiter.cleanup();
    
    // Entry should still be there (not expired yet in test timeframe)
    const attempts = limiter.getAttempts();
    expect(attempts.has(ip)).toBe(true);
  });
  
  it('provides retry-after seconds', () => {
    const ip = '192.168.1.1';
    
    for (let i = 0; i < 5; i++) {
      limiter.record(ip, false);
    }
    
    const result = limiter.check(ip);
    expect(result.retryAfter).toBeGreaterThan(0);
    expect(result.retryAfter).toBeLessThanOrEqual(300); // 5 minutes max
  });
});
