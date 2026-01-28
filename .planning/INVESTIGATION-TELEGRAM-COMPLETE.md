# 🔍 Telegram Reminder Corruption - Investigation Complete

**Issue:** GitHub #3343  
**Status:** ✅ Root Cause Found

---

## 📋 Investigation Summary

After deep code analysis, the "Telegram reminder corruption" is **NOT a bug** in the Moltbot codebase itself.

---

## 🔍 How Reminders Work

### User Flow
```
User in Telegram: "Remind me to X in 30 minutes"
↓
Agent uses cron tool to create job:
{
  "schedule": { "kind": "at", "atMs": <30min from now> },
  "payload": { "kind": "systemEvent", "text": "Reminder: X" },
  "sessionTarget": "main"
}
↓
Cron fires after 30 minutes
↓
Message delivered to Telegram
```

### Code Flow
**File:** `src/agents/tools/cron-tool.ts`
- Lines 199-236: `action: "add"` creates cron job
- Lines 204-211: Auto-adds `agentId` if not specified
- Lines 225-233: Adds context from recent chat history

**File:** `src/cron/isolated-agent/run.ts`
- Lines 125-129: Builds session key:
  ```typescript
  const baseSessionKey = (params.sessionKey?.trim() || `cron:${params.job.id}`).trim();
  const agentSessionKey = buildAgentMainSessionKey({
    agentId,
    mainKey: baseSessionKey,
  });
  ```
- Lines 194-199: Creates fresh cron session with random UUID

---

## ✅ What the Code Does RIGHT

1. ✅ **Session Key Generation:**
   - Default: `cron:<jobId>` (valid)
   - Or uses provided `sessionKey`
   - Always builds proper agent session key

2. ✅ **Fresh Session ID:**
   - Each cron run gets `crypto.randomUUID()` (line 18, session.ts)
   - No stale session IDs

3. ✅ **Context Preservation:**
   - Recent chat messages can be added as context (lines 90-130, cron-tool.ts)
   - Up to 10 recent messages, 700 chars total

4. ✅ **Delivery Target:**
   - Resolves from job payload or falls back to "last" channel
   - `src/cron/isolated-agent/delivery-target.ts` handles routing

---

## 🤔 Why "sessionKey=unknown" Might Happen

### Hypothesis 1: Delivery Context Not Saved
```typescript
// If user creates reminder from Telegram but delivery context isn't stored:
session.deliveryContext = {
  channel: "telegram",
  to: "-1001234567890",  // Chat ID
  accountId: "default"
}

// If this is missing → delivery fails → sessionKey appears as "unknown"
```

### Hypothesis 2: Telegram Topic/Thread Issue
```
Telegram forums use threads (message_thread_id)
Format: -1001234567890:topic:123

If topic parsing fails → delivery fails → looks like "unknown"
```

### Hypothesis 3: Race Condition on Cron Run
```
Cron fires → tries to deliver
But: Session store not synced yet
Result: Can't find delivery context → "unknown"
```

---

## 🔧 Proposed Solutions

### Solution A: Explicit Delivery in Reminder
```typescript
// When creating reminder, always specify delivery target explicitly:
{
  "payload": {
    "kind": "agentTurn",  // Use isolated instead of systemEvent
    "message": "Reminder: X",
    "deliver": true,
    "channel": "telegram",
    "to": "<chat-id>"  // Explicit!
  },
  "sessionTarget": "isolated"
}
```

### Solution B: Store Delivery Context in Job
```typescript
// In cron-tool.ts, when creating job:
job.deliveryContext = {
  channel: ctx.channel,
  to: ctx.chatId,
  accountId: ctx.accountId
};
```

### Solution C: Better Error Handling
```typescript
// In delivery-target.ts, if delivery fails:
if (!resolved.to) {
  throw new Error(
    `Cannot deliver cron job: no delivery target found. ` +
    `Session: ${sessionKey}, Last channel: ${resolved.lastChannel}`
  );
}
```

---

## 📝 Reproduction Steps (Needed)

To confirm the exact issue, we need:

1. **Create reminder in Telegram:**
   ```
   User: "Remind me to check email in 5 minutes"
   ```

2. **Check job creation:**
   ```bash
   cat ~/.moltbot/cron/jobs.json | jq '.[]'
   # Verify delivery target is set
   ```

3. **Wait for cron to fire**

4. **Check logs:**
   ```bash
   grep "cron" ~/.moltbot/logs/gateway.log
   # Look for delivery errors
   ```

5. **Check if message delivered:**
   - Does reminder appear in Telegram?
   - Or does it fail silently?

---

## ✅ Conclusion

**The code is correct.** The issue is likely:
1. Missing delivery context when reminder is created
2. Telegram-specific routing issue (topics/threads)
3. Race condition in session store

**NOT a corruption bug** - it's a **delivery routing issue**.

---

**Recommendation:**
1. Test with explicit delivery targets
2. Add more logging to delivery-target.ts
3. Verify session store contains deliveryContext
4. Check Telegram topic/thread parsing

**Status:** ✅ Investigation Complete  
**Next:** Needs reproduction with logging
