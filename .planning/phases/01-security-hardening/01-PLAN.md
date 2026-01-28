---
plan_id: 01-auth-hardening
phase: 1
wave: 1
autonomous: true
---

# Gateway Authentication Hardening

## Goal

Implement robust gateway authentication with token validation, rate limiting, and removal of dangerous bypass options.

## Context

Currently, gateway authentication has several weaknesses:
- Short tokens (< 32 chars) are accepted
- No rate limiting on authentication attempts
- Dangerous bypass flags (`allowInsecureAuth`, `dangerouslyDisableDeviceAuth`)
- Loopback connections can skip authentication in some configurations

## Tasks

### Task 1: Add Token Validation Function

**File:** `src/gateway/auth.ts`

Add after line 252 (end of file):

```typescript
export function validateGatewayAuthToken(token: string): { valid: boolean; reason?: string } {
  if (!token || token.length < 32) {
    return { valid: false, reason: 'Token must be at least 32 characters' };
  }
  
  // Check entropy (at least 20 unique characters)
  const uniqueChars = new Set(token).size;
  if (uniqueChars < 20) {
    return { valid: false, reason: 'Token must have higher entropy (at least 20 unique chars)' };
  }
  
  return { valid: true };
}
```

Update `resolveGatewayAuth()` around line 167-185 to validate tokens:

```typescript
export function resolveGatewayAuth(params: {
  authConfig?: GatewayAuthConfig | null;
  env?: NodeJS.ProcessEnv;
  tailscaleMode?: GatewayTailscaleMode;
}): ResolvedGatewayAuth {
  const authConfig = params.authConfig ?? {};
  const env = params.env ?? process.env;
  const token = authConfig.token ?? env.CLAWDBOT_GATEWAY_TOKEN ?? undefined;
  const password = authConfig.password ?? env.CLAWDBOT_GATEWAY_PASSWORD ?? undefined;
  
  // Validate token if provided
  if (token) {
    const validation = validateGatewayAuthToken(token);
    if (!validation.valid) {
      throw new Error(`Invalid gateway token: ${validation.reason}`);
    }
  }
  
  const mode: ResolvedGatewayAuth["mode"] = authConfig.mode ?? (password ? "password" : "token");
  const allowTailscale =
    authConfig.allowTailscale ?? (params.tailscaleMode === "serve" && mode !== "password");
  return {
    mode,
    token,
    password,
    allowTailscale,
  };
}
```

### Task 2: Implement Rate Limiter

**New file:** `src/gateway/rate-limiter.ts`

```typescript
export interface RateLimitEntry {
  count: number;
  resetAt: number;
  firstAttemptAt: number;
}

export class AuthRateLimiter {
  private attempts: Map<string, RateLimitEntry> = new Map();
  private readonly maxAttempts: number = 5;
  private readonly windowMs: number = 5 * 60 * 1000; // 5 minutes
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  check(ip: string): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const entry = this.attempts.get(ip);

    if (!entry) {
      return { allowed: true };
    }

    if (now >= entry.resetAt) {
      this.attempts.delete(ip);
      return { allowed: true };
    }

    if (entry.count >= this.maxAttempts) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      return { allowed: false, retryAfter };
    }

    return { allowed: true };
  }

  record(ip: string, success: boolean): void {
    if (success) {
      this.attempts.delete(ip);
      return;
    }

    const now = Date.now();
    const entry = this.attempts.get(ip);

    if (!entry || now >= entry.resetAt) {
      this.attempts.set(ip, {
        count: 1,
        resetAt: now + this.windowMs,
        firstAttemptAt: now,
      });
    } else {
      entry.count += 1;
    }
  }

  cleanup(): void {
    const now = Date.now();
    for (const [ip, entry] of this.attempts.entries()) {
      if (now >= entry.resetAt) {
        this.attempts.delete(ip);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.attempts.clear();
  }
}
```

### Task 3: Integrate Rate Limiter

**File:** `src/gateway/server/ws-connection/message-handler.ts`

Add import at top:
```typescript
import { AuthRateLimiter } from "../../rate-limiter.js";
```

Add rate limiter instance (around line 50, with other class properties):
```typescript
private rateLimiter = new AuthRateLimiter();
```

Update connection handler (around line 371-372) to check rate limit before auth:

```typescript
// Rate limit check
const clientIp = req.socket?.remoteAddress ?? 'unknown';
const rateCheck = this.rateLimiter.check(clientIp);
if (!rateCheck.allowed) {
  ws.close(1008, `Rate limit exceeded. Try again in ${rateCheck.retryAfter}s`);
  return;
}

// Existing auth code...
const authResult = await authorizeGatewayConnect({
  auth,
  connectAuth,
  req,
  trustedProxies,
});

// Record auth attempt
this.rateLimiter.record(clientIp, authResult.ok);

if (!authResult.ok) {
  ws.close(1008, `Authentication failed: ${authResult.reason}`);
  return;
}
```

### Task 4: Deprecate Bypass Flags

**File:** `src/security/audit.ts`

Update severity check around lines 323-343:

```typescript
if (cfg.gateway?.controlUi?.allowInsecureAuth === true) {
  findings.push({
    checkId: "gateway.control_ui.insecure_auth",
    severity: "critical", // Changed from previous
    title: "DEPRECATED: Control UI allows insecure HTTP auth",
    detail:
      "gateway.controlUi.allowInsecureAuth=true is deprecated and will be removed in Phase 2. " +
      "This flag allows token-only auth over HTTP and skips device identity.",
    remediation: "Remove this flag and use HTTPS (Tailscale Serve) or localhost only.",
  });
}

if (cfg.gateway?.controlUi?.dangerouslyDisableDeviceAuth === true) {
  findings.push({
    checkId: "gateway.control_ui.device_auth_disabled",
    severity: "critical",
    title: "DEPRECATED: DANGEROUS - Control UI device auth disabled",
    detail:
      "gateway.controlUi.dangerouslyDisableDeviceAuth=true is deprecated and will be removed in Phase 2. " +
      "This disables device identity checks for the Control UI.",
    remediation: "Remove this flag immediately unless you are in a short-lived break-glass scenario.",
  });
}
```

### Task 5: Add Auth Audit Logging

**New file:** `src/gateway/auth-audit-log.ts`

```typescript
import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";

export interface AuthAuditEvent {
  timestamp: number;
  clientIp: string;
  method: 'token' | 'password' | 'tailscale' | 'device-token';
  success: boolean;
  reason?: string;
  userId?: string;
}

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_LOG_FILES = 5;

async function ensureLogDir(): Promise<string> {
  const logDir = path.join(resolveStateDir(), 'logs');
  await fs.mkdir(logDir, { recursive: true, mode: 0o700 });
  return logDir;
}

async function getLogPath(): Promise<string> {
  const logDir = await ensureLogDir();
  return path.join(logDir, 'auth-audit.jsonl');
}

async function rotateLogIfNeeded(logPath: string): Promise<void> {
  try {
    const stats = await fs.stat(logPath);
    if (stats.size < MAX_LOG_SIZE) return;

    // Rotate logs
    for (let i = MAX_LOG_FILES - 1; i > 0; i--) {
      const oldPath = `${logPath}.${i}`;
      const newPath = `${logPath}.${i + 1}`;
      try {
        await fs.rename(oldPath, newPath);
      } catch {
        // File doesn't exist, skip
      }
    }

    await fs.rename(logPath, `${logPath}.1`);
  } catch {
    // Log file doesn't exist yet
  }
}

export async function logAuthEvent(event: AuthAuditEvent): Promise<void> {
  try {
    const logPath = await getLogPath();
    await rotateLogIfNeeded(logPath);
    
    const line = JSON.stringify(event) + '\n';
    await fs.appendFile(logPath, line, { mode: 0o600 });
  } catch (error) {
    // Don't fail auth on logging errors
    console.error('Failed to log auth event:', error);
  }
}

export async function getRecentAuthEvents(limit = 100): Promise<AuthAuditEvent[]> {
  try {
    const logPath = await getLogPath();
    const content = await fs.readFile(logPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const events = lines
      .slice(-limit)
      .map(line => JSON.parse(line) as AuthAuditEvent);
    return events.reverse(); // Most recent first
  } catch {
    return [];
  }
}
```

**File:** `src/gateway/auth.ts`

Update `authorizeGatewayConnect()` around line 199-252 to add logging:

```typescript
import { logAuthEvent } from "./auth-audit-log.js";

export async function authorizeGatewayConnect(params: {
  auth: ResolvedGatewayAuth;
  connectAuth?: ConnectAuth | null;
  req?: IncomingMessage;
  trustedProxies?: string[];
  tailscaleWhois?: TailscaleWhoisLookup;
}): Promise<GatewayAuthResult> {
  const { auth, connectAuth, req, trustedProxies } = params;
  const tailscaleWhois = params.tailscaleWhois ?? readTailscaleWhoisIdentity;
  const localDirect = isLocalDirectRequest(req, trustedProxies);
  const clientIp = req?.socket?.remoteAddress ?? 'unknown';

  // Existing auth logic...
  let result: GatewayAuthResult;

  if (auth.allowTailscale && !localDirect) {
    const tailscaleCheck = await resolveVerifiedTailscaleUser({
      req,
      tailscaleWhois,
    });
    if (tailscaleCheck.ok) {
      result = {
        ok: true,
        method: "tailscale",
        user: tailscaleCheck.user.login,
      };
    } else {
      result = { ok: false, reason: tailscaleCheck.reason };
    }
  } else if (auth.mode === "token") {
    if (!auth.token) {
      result = { ok: false, reason: "token_missing_config" };
    } else if (!connectAuth?.token) {
      result = { ok: false, reason: "token_missing" };
    } else if (!safeEqual(connectAuth.token, auth.token)) {
      result = { ok: false, reason: "token_mismatch" };
    } else {
      result = { ok: true, method: "token" };
    }
  } else if (auth.mode === "password") {
    const password = connectAuth?.password;
    if (!auth.password) {
      result = { ok: false, reason: "password_missing_config" };
    } else if (!password) {
      result = { ok: false, reason: "password_missing" };
    } else if (!safeEqual(password, auth.password)) {
      result = { ok: false, reason: "password_mismatch" };
    } else {
      result = { ok: true, method: "password" };
    }
  } else {
    result = { ok: false, reason: "unauthorized" };
  }

  // Log auth event
  await logAuthEvent({
    timestamp: Date.now(),
    clientIp,
    method: result.method ?? (auth.mode === 'token' ? 'token' : 'password'),
    success: result.ok,
    reason: result.reason,
    userId: result.user,
  });

  return result;
}
```

## Success Criteria

- [ ] Token validation function enforces 32+ chars and 20+ unique chars
- [ ] Rate limiter limits to 5 attempts per 5 minutes per IP
- [ ] Bypass flags marked as CRITICAL in security audit
- [ ] Auth events logged to `~/.moltbot/logs/auth-audit.jsonl`
- [ ] Log rotation works at 10MB with 5 file retention
- [ ] All auth tests pass

## Testing

```bash
# Test token validation
pnpm test src/gateway/auth.test.ts

# Test rate limiter
pnpm test src/gateway/rate-limiter.test.ts

# Integration test
pnpm test:e2e src/gateway/server.auth.e2e.test.ts
```
