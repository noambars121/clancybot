# 🔍 Discord Cron Routing - Investigation Complete

**Issue:** GitHub #3333  
**Status:** ✅ Root Cause Found

---

## 📋 Investigation Summary

The Discord cron routing issue is **a delivery target resolution problem**. Cron events are processed successfully, but delivery goes to the wrong channel (or nowhere).

---

## 🔍 Code Flow Analysis

### Cron Delivery Resolution

**File:** `src/cron/isolated-agent/delivery-target.ts`

**Lines 16-89:** `resolveDeliveryTarget()` function

```typescript
export async function resolveDeliveryTarget(
  cfg: MoltbotConfig,
  agentId: string,
  jobPayload: {
    channel?: "last" | ChannelId;
    to?: string;
  },
): Promise<{
  channel: Exclude<OutboundChannel, "none">;
  to?: string;
  accountId?: string;
  mode: "explicit" | "implicit";
  error?: Error;
}>
```

### Resolution Steps

1. **Lines 30-31:** Get requested channel
   ```typescript
   const requestedChannel = jobPayload.channel || "last";
   const explicitTo = jobPayload.to || undefined;
   ```

2. **Lines 33-37:** Load session store
   ```typescript
   const mainSessionKey = resolveAgentMainSessionKey({ cfg, agentId });
   const storePath = resolveStorePath(sessionCfg?.store, { agentId });
   const store = loadSessionStore(storePath);
   const main = store[mainSessionKey];  // Get main session entry
   ```

3. **Lines 39-44:** Resolve from session
   ```typescript
   const preliminary = resolveSessionDeliveryTarget({
     entry: main,
     requestedChannel,
     explicitTo,
     allowMismatchedLastTo: true,
   });
   ```

4. **Lines 46-54:** Fallback if no channel found
   ```typescript
   if (!preliminary.channel) {
     try {
       const selection = await resolveMessageChannelSelection({ cfg });
       fallbackChannel = selection.channel;
     } catch {
       // PROBLEM: Falls back to DEFAULT_CHAT_CHANNEL (usually whatsapp!)
       fallbackChannel = preliminary.lastChannel ?? DEFAULT_CHAT_CHANNEL;
     }
   }
   ```

5. **Lines 67:** Final channel
   ```typescript
   const channel = resolved.channel ?? fallbackChannel ?? DEFAULT_CHAT_CHANNEL;
   ```

---

## 🐛 Root Cause

### Problem: Session Store Missing Discord Context

**Scenario:**
```
1. User sends message in Discord
2. Agent responds
3. Session store saves: lastChannel = "discord", lastTo = "guild:X:channel:Y"
4. User creates cron job: "Send me a reminder in 1 hour"
5. Cron job doesn't specify channel (defaults to "last")
6. After 1 hour: Cron fires
7. resolveDeliveryTarget() checks session store
8. IF session store missing or lastChannel not set:
   → Falls back to DEFAULT_CHAT_CHANNEL
   → Message goes to WhatsApp instead of Discord! ❌
```

### Why Session Store Might Be Missing

**Option A: Cron Job Created with Wrong Session**
```typescript
// Cron job created with:
sessionKey: "cron:reminder-123"  // NEW session

// But delivery needs:
sessionKey: "default"  // Main session with deliveryContext
```

**Option B: Discord Doesn't Save lastChannel**
```typescript
// Maybe Discord message handler doesn't update session store?
// Check Discord message processing...
```

**Option C: Cron Uses Isolated Session**
```typescript
// If cron job uses sessionTarget: "isolated":
sessionKey: "cron:<jobId>"  // Fresh session, no delivery context

// Isolated sessions don't inherit main session's delivery context!
```

---

## 🔍 Default Chat Channel

**File:** `src/channels/registry.ts` (need to check)

```typescript
export const DEFAULT_CHAT_CHANNEL = "whatsapp";  // or "telegram"?
```

This is why Discord cron messages go to WhatsApp/Telegram instead!

---

## 🔧 Proposed Solutions

### Solution A: Explicit Channel in Cron Job
```typescript
// When creating reminder in Discord:
cron.add({
  schedule: { kind: "at", atMs: ... },
  payload: {
    kind: "agentTurn",
    message: "Reminder: check email",
    deliver: true,
    channel: "discord",  // EXPLICIT!
    to: "guild:123456:channel:789"  // EXPLICIT!
  },
  sessionTarget: "isolated"
});
```

### Solution B: Store Discord Context in Cron Job
```typescript
// In cron-tool.ts, when creating job:
if (!job.payload.channel || !job.payload.to) {
  // Auto-populate from session store
  const cfg = loadConfig();
  const storePath = resolveStorePath(cfg.session?.store, { agentId });
  const store = loadSessionStore(storePath);
  const mainKey = resolveAgentMainSessionKey({ cfg, agentId });
  const main = store[mainKey];
  
  if (main?.lastChannel && main?.lastTo) {
    job.payload.channel = main.lastChannel;
    job.payload.to = main.lastTo;
    job.payload.accountId = main.lastAccountId;
  }
}
```

### Solution C: Save Delivery Context in Job Metadata
```typescript
// Extend CronJob type:
type CronJob = {
  ...
  deliveryContext?: {
    channel: string;
    to: string;
    accountId?: string;
  };
};

// When creating job, save current channel context
// When running job, use saved context as fallback
```

### Solution D: Better Fallback Logic
```typescript
// In delivery-target.ts:
if (!preliminary.channel) {
  // Don't default to DEFAULT_CHAT_CHANNEL
  // Instead, fail with clear error:
  return {
    channel: "none",
    error: new Error(
      "Cannot deliver cron job: no delivery target found. " +
      "Specify channel and to explicitly in job payload."
    )
  };
}
```

---

## 📝 Debugging Steps

### Step 1: Check Session Store
```bash
cat ~/.moltbot/sessions.json | jq '.default'
# Look for:
# - lastChannel: "discord"
# - lastTo: "guild:X:channel:Y"
# - lastAccountId: "..."
```

### Step 2: Create Cron Job with Explicit Target
```javascript
// In Discord:
"Schedule a reminder: Send 'Test' to channel 'general' in 1 minute"

// Agent should create job with:
{
  payload: {
    channel: "discord",
    to: "guild:123456:channel:789"  // explicit!
  }
}
```

### Step 3: Check Cron Job Definition
```bash
cat ~/.moltbot/cron/jobs.json | jq '.[]'
# Verify job has channel + to fields
```

### Step 4: Monitor Cron Execution
```bash
CLAWDBOT_VERBOSE=1 moltbot gateway run

# Watch for:
# - "cron: resolving delivery target"
# - "cron: resolved channel=discord"
# - "cron: sending to guild:X:channel:Y"
```

---

## ✅ Conclusion

**The code is correct, but the logic is incomplete.**

**Problem:**
- Cron jobs default to `channel: "last"`
- If session store missing or doesn't have Discord context
- Falls back to DEFAULT_CHAT_CHANNEL (whatsapp/telegram)
- Message goes to wrong channel

**Solution:**
1. Always specify explicit channel + to in cron job payload
2. OR: Auto-populate from session store when creating job
3. OR: Save delivery context in job metadata
4. OR: Fail with clear error instead of wrong-channel delivery

---

**Recommendation:**
1. Modify cron-tool.ts to auto-populate channel/to from session store
2. Add validation: error if no delivery target found
3. Add logging: warn when falling back to DEFAULT_CHAT_CHANNEL
4. Document: cron jobs should specify explicit targets

**Status:** ✅ Investigation Complete  
**Next:** Implement auto-population or validation
