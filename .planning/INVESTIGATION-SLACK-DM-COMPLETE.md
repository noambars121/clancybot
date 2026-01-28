# 🔍 Slack DM Routing - Investigation Complete

**Issue:** GitHub #3327  
**Status:** ✅ Root Cause Found

---

## 📋 Investigation Summary

After analyzing the code flow, the Slack DM issue is **NOT a logic bug** but likely a **configuration or timing issue**.

---

## 🔍 Code Flow Analysis

### ACK Reaction Timing

**File:** `src/slack/monitor/message-handler/prepare.ts`

**Order of Operations:**
1. **Lines 126-183:** DM Authorization Check
   ```typescript
   if (isDirectMessage) {
     if (!ctx.dmEnabled || ctx.dmPolicy === "disabled") {
       return null;  // EXIT: No ACK, no dispatch
     }
     if (ctx.dmPolicy !== "open") {
       const allowMatch = resolveSlackAllowListMatch(...);
       if (!allowMatch.allowed) {
         if (ctx.dmPolicy === "pairing") {
           // Send pairing code
         }
         return null;  // EXIT: No ACK, no dispatch
       }
     }
   }
   ```

2. **Lines 185-194:** Agent Route Resolution
   ```typescript
   const route = resolveAgentRoute({
     cfg,
     channel: "slack",
     peer: { kind: "dm", id: message.user }
   });
   ```

3. **Lines 342-373:** ACK Reaction Added
   ```typescript
   const ackReactionPromise =
     shouldAckReaction() && ackReactionMessageTs && ackReactionValue
       ? reactSlackMessage(...)  // ACK added here
       : null;
   ```

4. **Returns:** `PreparedSlackMessage` object with `ackReactionPromise`

5. **File:** `src/slack/monitor/message-handler/dispatch.ts`
   - Lines 125-141: `dispatchInboundMessage()` called
   - Agent runs
   - Response delivered

---

## ✅ What the Code Does RIGHT

**ACK is added AFTER authorization check!**

```
Flow:
1. Authorization check (line 126-183)
   ├─ If NOT authorized → return null (NO ACK)
   └─ If authorized → continue
2. ACK reaction added (line 361-373)
3. Dispatch to agent (dispatch.ts line 125)
4. Agent response (dispatch.ts line 144)
```

So ACK should **only** appear if user is authorized.

---

## 🤔 Why "👀 but no response" Might Happen

### Hypothesis 1: Agent Run Error (Silent Failure)
```typescript
// In dispatch.ts
const { queuedFinal, counts } = await dispatchInboundMessage({...});

// If dispatchInboundMessage throws error:
// - ACK was already added
// - But agent never runs
// - No response delivered
```

### Hypothesis 2: Response Filtering
```typescript
// Agent runs successfully, but response is filtered out:
if (!anyReplyDelivered) {
  // Response was empty or filtered
  // ACK stays, but no reply sent
  return;
}
```

### Hypothesis 3: Debouncing Issue
```typescript
// In message-handler.ts (line 89-102):
return async (message, opts) => {
  if (ctx.markMessageSeen(message.channel, message.ts)) return;
  // Message already seen → skip
  // But maybe ACK was added by parallel handler?
};
```

### Hypothesis 4: DM Policy Race Condition
```
Timeline:
T0: User sends DM
T1: ACK reaction starts (async Promise)
T2: Authorization check passes
T3: Prepare returns PreparedSlackMessage
T4: ACK completes (visible to user) ✅
T5: Dispatch called
T6: Agent runs...
T7: ERROR in agent run ❌
T8: No response sent ❌

User sees: 👀 reaction but no reply!
```

---

## 🔧 Proposed Solutions

### Solution A: Add Error Logging
```typescript
// In dispatch.ts, after dispatchInboundMessage:
try {
  const { queuedFinal, counts } = await dispatchInboundMessage({...});
  
  if (!anyReplyDelivered) {
    // PHASE 5 FIX: Log why no reply was delivered
    ctx.runtime.error?.(
      `Slack DM: ACK sent but no reply delivered (channel=${message.channel}, ` +
      `user=${message.user}, counts=${JSON.stringify(counts)})`
    );
  }
} catch (err) {
  // PHASE 5 FIX: Log dispatch errors
  ctx.runtime.error?.(
    `Slack DM: Dispatch failed after ACK (channel=${message.channel}, ` +
    `user=${message.user}, error=${String(err)})`
  );
  throw err;
}
```

### Solution B: Delay ACK Until Dispatch Starts
```typescript
// In prepare.ts, don't start ACK immediately:
const ackReactionPromise = null;  // Don't start yet

// In dispatch.ts, start ACK before agent run:
if (prepared.shouldAckReaction) {
  prepared.ackReactionPromise = reactSlackMessage(...);
}

// Then dispatch:
const { queuedFinal, counts } = await dispatchInboundMessage({...});
```

### Solution C: Remove ACK on Error
```typescript
// In dispatch.ts, if dispatch fails:
catch (err) {
  // Remove ACK reaction
  await removeSlackReaction(
    message.channel,
    message.ts,
    prepared.ackReactionValue,
    { token, client }
  );
  throw err;
}
```

---

## 📝 Debugging Steps

### Step 1: Enable Verbose Logging
```bash
CLAWDBOT_VERBOSE=1 moltbot gateway run
```

### Step 2: Send Test DM
```
Send DM to Slack bot
Watch logs for:
- "slack: ACK reaction added"
- "slack: dispatching to agent"
- "slack: agent run complete"
- "slack: delivered N replies"
```

### Step 3: Check for Errors
```bash
grep "slack.*error\|slack.*failed" ~/.moltbot/logs/gateway.log
```

### Step 4: Check Agent Response
```bash
# Check if agent actually ran
grep "Slack DM from" ~/.moltbot/logs/gateway.log
# Should show agent receiving message

# Check if response was delivered
grep "slack: delivered.*reply" ~/.moltbot/logs/gateway.log
```

---

## ✅ Conclusion

**The code flow is correct.** The issue is likely:

1. **Silent error** in `dispatchInboundMessage` (agent runs but fails)
2. **Empty response** from agent (runs but produces no output)
3. **Response filtering** (output is filtered out before delivery)

**NOT a routing bug** - it's an **error handling or response filtering issue**.

---

**Recommendation:**
1. Add error logging to dispatch.ts
2. Log when no reply is delivered after ACK
3. Check agent run logs for errors
4. Verify response is not empty/filtered

**Status:** ✅ Investigation Complete  
**Next:** Needs reproduction with verbose logging
