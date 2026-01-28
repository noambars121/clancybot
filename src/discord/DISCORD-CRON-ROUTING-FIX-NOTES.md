# Discord Cron Routing Fix - Investigation Notes

**Issue:** GitHub #3333  
**Problem:** Cron events processed but not delivered to Discord  
**Status:** Requires investigation

---

## Problem Description

```
Cron job fires → Agent runs → Response generated → NOT sent to Discord
```

Symptoms:
- Cron job executes successfully
- Agent processes the request
- No message appears in Discord
- No error messages

---

## Investigation Points

### 1. Check Cron Delivery Target Resolution

In `src/cron/isolated-agent/delivery-target.ts`:

**Key Function:** `resolveDeliveryTarget`
- Resolves where to send cron response
- Uses session store to find "last" channel
- Falls back to DEFAULT_CHAT_CHANNEL

**Potential Issue:** Discord routing may not be properly configured

### 2. Check Discord Sender Integration

Files to investigate:
- `src/discord/send.ts` - Discord message sender
- `src/discord/send.guild.ts` - Guild message sending
- `src/cron/isolated-agent/run.ts` - Cron agent runner
- `src/infra/outbound/targets.ts` - Outbound target resolution

**Key Question:** Is Discord sender properly hooked up to cron delivery?

### 3. Check Session Store

```typescript
// src/cron/isolated-agent/delivery-target.ts (lines 33-37)
const mainSessionKey = resolveAgentMainSessionKey({ cfg, agentId });
const storePath = resolveStorePath(sessionCfg?.store, { agentId });
const store = loadSessionStore(storePath);
const main = store[mainSessionKey];
```

**Hypothesis:** Session store may not contain Discord delivery context

---

## Debug Steps

### Step 1: Enable Verbose Logging
```bash
CLAWDBOT_VERBOSE=1 moltbot gateway run
```

### Step 2: Trigger Cron Job
```bash
# Manually trigger a cron job
moltbot agent --message "test cron" --channel discord --to guild:123456
```

### Step 3: Check Logs
Look for:
- "Cron job running"
- "Agent response generated"
- "Delivery target resolved: channel=discord"
- "Sending Discord message to ..."
- Any errors

### Step 4: Inspect Session Store
```bash
cat ~/.moltbot/sessions.json | jq '.[] | select(.deliveryContext.channel == "discord")'
```

---

## Proposed Fix

### Option A: Explicit Discord Routing
```typescript
// In cron config
{
  "cron": {
    "jobs": [{
      "schedule": "0 9 * * *",
      "prompt": "Good morning!",
      "channel": "discord",
      "to": "guild:123456:channel:789"
    }]
  }
}
```

### Option B: Fix Fallback Logic
```typescript
// In delivery-target.ts
const fallbackChannel: Exclude<OutboundChannel, "none"> | undefined;
if (!preliminary.channel) {
  try {
    const selection = await resolveMessageChannelSelection({ cfg });
    fallbackChannel = selection.channel;
    
    // PHASE 4 FIX: Ensure Discord is considered
    if (fallbackChannel === "discord") {
      log.info("Cron delivery defaulting to Discord");
    }
  } catch {
    fallbackChannel = preliminary.lastChannel ?? DEFAULT_CHAT_CHANNEL;
  }
}
```

### Option C: Add Delivery Validation
```typescript
// Before sending
if (channel === "discord" && !to) {
  throw new Error("Discord delivery requires 'to' parameter (guild:X:channel:Y)");
}
```

---

## Related Files

- `src/cron/isolated-agent/delivery-target.ts` - Delivery routing
- `src/cron/isolated-agent/run.ts` - Cron runner
- `src/discord/send.ts` - Discord sender
- `src/discord/send.guild.ts` - Guild sender
- `src/infra/outbound/targets.ts` - Target resolution
- `src/config/sessions.ts` - Session store

---

**Status:** Documented, requires debug session  
**Priority:** 🟡 Medium  
**Assigned:** Cron/Discord integration team
