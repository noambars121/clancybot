# Slack DM Not Triggering Agent - Investigation Notes

**Issue:** GitHub #3327  
**Problem:** Slack DMs get 👀 reaction but don't trigger agent run  
**Status:** Requires debugging

---

## Problem Description

```
User sends DM → Bot adds 👀 reaction → No agent response
```

Symptoms:
- ACK reaction (👀) is added successfully
- Message is acknowledged
- But agent never runs
- No error messages

---

## Investigation Points

### 1. Check ACK vs Agent Trigger Logic

In `src/slack/monitor/message-handler/prepare.ts`:

**ACK Reaction Decision** (lines 345-358):
```typescript
const shouldAckReaction = () =>
  Boolean(
    ackReaction &&
    shouldAckReactionGate({
      scope: ctx.ackReactionScope as AckReactionScope | undefined,
      isDirect: isDirectMessage,
      isGroup: isRoomish,
      isMentionableGroup: isRoom,
      requireMention: Boolean(shouldRequireMention),
      canDetectMention,
      effectiveWasMentioned,
      shouldBypassMention: mentionGate.shouldBypassMention,
    }),
  );
```

**Potential Issue:** ACK reaction may be added, but function returns `null` before dispatch.

### 2. Possible Early Returns

The prepare function has many early `return null` checks:
- Line 98: Bot messages (if allowBots=false)
- Line 104: DM without user ID
- Line 121: Channel not allowed
- Line 134: DMs disabled
- Line 180: DM policy (unauthorized)
- Line 246: Room user unauthorized
- Line 288: Command unauthorized
- Line 331: No mention (in rooms)
- Line 340: Empty body

**Key Question:** Is ACK reaction added BEFORE these checks?

### 3. DM Policy Check (Lines 126-183)

```typescript
if (isDirectMessage) {
  if (!ctx.dmEnabled || ctx.dmPolicy === "disabled") {
    return null; // ← Early exit, but ACK may already be added?
  }
  
  if (ctx.dmPolicy !== "open") {
    const allowMatch = resolveSlackAllowListMatch(...);
    if (!allowMatch.allowed) {
      if (ctx.dmPolicy === "pairing") {
        // Send pairing code
      }
      return null; // ← Early exit after pairing
    }
  }
}
```

**Hypothesis:** ACK reaction is added in parallel/async, but prepare returns null before dispatch.

---

## Proposed Fix

### Option A: Move ACK Reaction AFTER All Checks
```typescript
// At END of prepare function, before return
const ackReactionPromise = shouldAckReaction() && ...
```

### Option B: Add Debug Logging
```typescript
if (shouldAckReaction() && ackReactionValue) {
  log.debug(`Slack DM: Adding ACK reaction for ${message.channel}`);
  // ... add reaction ...
}

// Before dispatch
log.debug(`Slack DM: Dispatching to agent for ${message.channel}`);
```

### Option C: Check Return Path
```typescript
// In dispatch.ts (line 125-141)
const { queuedFinal, counts } = await dispatchInboundMessage({...});

// Log if no reply was delivered
if (!anyReplyDelivered) {
  log.warn(`Slack DM: No reply delivered for ${message.channel}`);
}
```

---

## Testing Steps

1. **Enable verbose logging:**
   ```bash
   CLAWDBOT_VERBOSE=1 moltbot gateway run
   ```

2. **Send test DM:**
   - Send simple DM to bot
   - Watch logs for:
     - "Adding ACK reaction"
     - "Dispatching to agent"
     - "No reply delivered" (warning)

3. **Check config:**
   ```json
   {
     "channels": {
       "slack": {
         "dmPolicy": "open", // or "pairing" if set up
         "ackReaction": "eyes"
       }
     }
   }
   ```

4. **Verify dispatcher is called:**
   - Add log in `dispatch.ts` line 125
   - Check if `dispatchInboundMessage` is actually called

---

## Related Files

- `src/slack/monitor/message-handler/prepare.ts` - Prepare logic
- `src/slack/monitor/message-handler/dispatch.ts` - Dispatch to agent
- `src/slack/monitor/message-handler.ts` - Debouncer
- `src/channels/ack-reactions.ts` - ACK reaction gating
- `src/auto-reply/dispatch.ts` - Agent invocation

---

**Status:** Documented, requires debug session  
**Priority:** 🟠 High  
**Assigned:** Slack integration team
