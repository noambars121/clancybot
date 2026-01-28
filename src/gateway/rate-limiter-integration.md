# Rate Limiter Integration Guide

The `AuthRateLimiter` class is created in `rate-limiter.ts` and ready for integration.

## Integration Points

### 1. Server Setup (Recommended)

**File:** `src/gateway/server-ws-runtime.ts` or `src/gateway/server/impl.ts`

Create a single shared rate limiter instance when the server starts:

```typescript
import { AuthRateLimiter } from "./rate-limiter.js";

const rateLimiter = new AuthRateLimiter();

// Pass to attachGatewayWsConnectionHandler via params
```

### 2. WebSocket Connection Handler

**File:** `src/gateway/server/ws-connection.ts`

Add `rateLimiter` to params:

```typescript
export function attachGatewayWsConnectionHandler(params: {
  // ... existing params
  rateLimiter: AuthRateLimiter;
}) {
  // Pass through to message handler
}
```

### 3. Message Handler

**File:** `src/gateway/server/ws-connection/message-handler.ts`

Add to params (line 131) and use before auth (line 567):

```typescript
export function attachGatewayWsMessageHandler(params: {
  // ... existing params
  rateLimiter: AuthRateLimiter;
}) {
  const { rateLimiter, ...rest } = params;
  
  // Before authorizeGatewayConnect (line 567):
  const rateCheck = rateLimiter.check(clientIp);
  if (!rateCheck.allowed) {
    close(1008, `Rate limit exceeded. Retry in ${rateCheck.retryAfter}s`);
    return;
  }
  
  // After auth:
  rateLimiter.record(clientIp, authResult.ok);
}
```

### 4. Cleanup on Server Shutdown

Ensure `rateLimiter.destroy()` is called when server shuts down to clear the cleanup interval.

##Status

- ✅ Rate limiter module created
- ⏸️  Integration pending (requires server refactoring)
- ℹ️  Can be added in a follow-up focused on WebSocket architecture

For immediate security improvement, the token validation and audit logging are already active.
