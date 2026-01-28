# PLAN 01: Complete Phase 1 Integrations

**Phase:** 2 - Security Enhancements  
**Priority:** HIGH (cleanup)  
**Effort:** 2 hours  
**Dependencies:** Phase 1 complete

---

## 🎯 Objective

Integrate the two remaining Phase 1 security modules that were deferred:
1. Rate Limiter → WebSocket gateway handler
2. Command Audit Log → Bash tool execution paths

---

## 📋 Tasks

### Task 1: Rate Limiter Integration (1 hour)

**Target File:** `src/gateway/server.impl.ts`

**Changes:**
1. Import `AuthRateLimiter` from `./rate-limiter.js`
2. Create global rate limiter instance in `startGatewayServer`
3. Add rate limit check before `authorizeGatewayConnect`
4. Return `429 Too Many Requests` on rate limit exceeded
5. Call `rateLimiter.recordSuccess()` after successful auth

**Integration Point:**
```typescript
// In authorizeGatewayConnect, before actual auth:
const rateLimitResult = rateLimiter.checkLimit(clientIp);
if (!rateLimitResult.allowed) {
  throw new Error(`Rate limit exceeded. Try again in ${rateLimitResult.retryAfterSeconds}s`);
}

// After successful auth:
rateLimiter.recordSuccess(clientIp);
```

### Task 2: Command Audit Log Integration (1 hour)

**Target Files:**
- `src/agents/tools/bash.ts` (primary)
- `src/agents/sandbox/docker.ts` (already partially integrated)

**Changes:**
1. Import `logCommand` from `../../security/command-audit-log.js`
2. Add command logging after execution in `bash.ts`
3. Include: session ID, user, command, sandbox mode, exit code, duration
4. Handle errors gracefully (don't block execution if logging fails)

**Integration Point:**
```typescript
// In bash tool, after command execution:
await logCommand({
  sessionId: context.sessionId,
  userId: context.userId,
  command: input.command,
  sandboxMode: context.sandboxConfig?.mode || 'none',
  elevated: input.elevated || false,
  exitCode: result.exitCode,
  duration: executionTime,
  timestamp: new Date(),
}).catch(err => {
  // Log but don't throw - auditing shouldn't block execution
  console.error('Command audit logging failed:', err);
});
```

---

## ✅ Verification

### Rate Limiter
```bash
# Test rate limiting
for i in {1..10}; do
  curl -H "Authorization: Bearer test-token" ws://localhost:18789
done
# Should see 429 after 5 attempts
```

### Command Audit Log
```bash
# Run some commands
moltbot message send "Run: ls -la"
moltbot message send "Run: whoami"

# Check log
cat ~/.moltbot/logs/command-audit.jsonl | jq .
# Should see command entries
```

---

## 📊 Success Criteria

- [ ] Rate limiter blocks 6th auth attempt within 5 minutes
- [ ] Rate limiter allows auth after cooldown
- [ ] Rate limiter resets on successful auth
- [ ] Command audit log captures bash tool executions
- [ ] Command audit log includes all required fields
- [ ] Logging failures don't crash execution

---

## 🔗 Related Files

- `src/gateway/rate-limiter.ts` (already created)
- `src/security/command-audit-log.ts` (already created)
- `src/gateway/server.impl.ts` (target for rate limiter)
- `src/agents/tools/bash.ts` (target for command log)

---

*Plan created on 2026-01-27*
