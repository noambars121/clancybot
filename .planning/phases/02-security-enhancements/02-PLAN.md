# PLAN 02: Session Management

**Phase:** 2 - Security Enhancements  
**Priority:** MEDIUM  
**Effort:** 3 hours  
**Dependencies:** None

---

## 🎯 Objective

Implement comprehensive session security:
1. Token expiration (configurable, default 24h)
2. Token rotation API
3. Session revocation
4. Active session listing

---

## 📋 Implementation

### Module 1: Token Expiration

**File:** `src/security/token-expiration.ts`

```typescript
export interface TokenMetadata {
  token: string;
  createdAt: number;
  expiresAt: number;
  rotatedAt?: number;
  deviceId?: string;
}

export function isTokenExpired(metadata: TokenMetadata): boolean;
export function getTokenTtlSeconds(metadata: TokenMetadata): number;
export function shouldRotateToken(metadata: TokenMetadata, rotateBeforeExpirySec: number): boolean;
```

### Module 2: Session Store

**File:** `src/security/session-store.ts`

```typescript
export interface ActiveSession {
  sessionId: string;
  deviceId?: string;
  token: string;
  createdAt: number;
  lastActivity: number;
  expiresAt: number;
  clientInfo: {
    id: string;
    platform?: string;
    version?: string;
  };
}

export class SessionStore {
  async registerSession(session: ActiveSession): Promise<void>;
  async getSession(sessionId: string): Promise<ActiveSession | null>;
  async updateLastActivity(sessionId: string): Promise<void>;
  async revokeSession(sessionId: string): Promise<void>;
  async listActiveSessions(deviceId?: string): Promise<ActiveSession[]>;
  async cleanupExpiredSessions(): Promise<number>;
}
```

### Integration Points

**File:** `src/gateway/auth.ts`
- Add `tokenMetadata` to `authorizeGatewayConnect` result
- Check token expiration before auth
- Return specific error for expired tokens

**File:** `src/gateway/server/ws-connection/message-handler.ts`
- Register session on successful connect
- Update last activity on requests
- Check expiration before each request

**File:** `src/cli/security-cli.ts`
- Add `moltbot security sessions list` command
- Add `moltbot security sessions revoke <sessionId>` command
- Add `moltbot security token rotate` command

---

## 🔧 Configuration

**File:** `src/config/zod-schema.core.ts`

Add to security config:
```typescript
session: z.object({
  tokenTtlHours: z.number().min(1).max(8760).default(24),
  rotateBeforeExpiryHours: z.number().min(1).max(24).default(2),
  maxSessionsPerDevice: z.number().min(1).max(100).default(10),
}).optional()
```

---

## ✅ Verification

```bash
# Test token expiration
moltbot config set security.session.tokenTtlHours 0.01 # 36 seconds
# Wait 40 seconds
# Try to connect -> should fail with "token expired"

# Test session listing
moltbot security sessions list
# Should show active sessions

# Test session revocation
SESSION_ID=$(moltbot security sessions list --json | jq -r '.[0].sessionId')
moltbot security sessions revoke $SESSION_ID
# Try to use revoked session -> should fail

# Test token rotation
moltbot security token rotate
# Old token should stop working, new token should work
```

---

## 📊 Success Criteria

- [ ] Tokens expire after configured TTL
- [ ] Expired tokens rejected with clear error
- [ ] Sessions can be listed via CLI
- [ ] Sessions can be revoked via CLI
- [ ] Token rotation generates new valid token
- [ ] Old token invalidated after rotation
- [ ] Expired sessions auto-cleanup
- [ ] Config validation for TTL ranges

---

*Plan created on 2026-01-27*
