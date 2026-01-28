# Telegram Reminder Corruption Fix - Investigation Notes

**Issue:** GitHub #3343  
**Problem:** Natural-language reminders corrupt session (sessionKey=unknown)  
**Status:** Requires more investigation

---

## Problem Description

When using natural-language reminders in Telegram:
```
User: "Remind me to X in 30 minutes"
→ Session gets corrupted
→ sessionKey becomes "unknown"
→ Cannot recover without manual intervention
```

---

## Suspected Root Causes

### 1. Session Key Generation Issue
- Reminder scheduling may generate invalid session keys
- Async operations may race and corrupt session state
- Thread/topic IDs may not be properly preserved

### 2. Delivery Context Loss
- Reminders may lose original chat context
- When reminder fires, it doesn't know where to send
- Falls back to "unknown" session key

### 3. Serialization Bug
- Session state may not serialize properly for delayed delivery
- JSON serialization may corrupt complex objects
- State restoration may fail

---

## Investigation Steps Required

1. **Find Reminder Code**
   - Search for reminder scheduling logic
   - Check cron job integration
   - Review delivery routing

2. **Debug Session Key Flow**
   - Add logging to session key generation
   - Track session key through reminder lifecycle
   - Verify delivery context preservation

3. **Test Reproduction**
   - Create minimal test case
   - Set natural-language reminder
   - Monitor session state changes

---

## Proposed Fix (Once Root Cause Found)

### Option A: Session Key Validation
```typescript
function validateSessionKey(key: string): string {
  if (!key || key === "unknown") {
    throw new Error("Invalid session key");
  }
  // Parse and validate format
  // Ensure all required components present
  return key;
}
```

### Option B: Delivery Context Backup
```typescript
interface ReminderPayload {
  message: string;
  deliveryContext: {
    channel: string;
    chatId: string;
    threadId?: string;
    sessionKey: string; // Backup for recovery
  };
  scheduledFor: number;
}
```

### Option C: Session Recovery
```typescript
async function recoverSession(
  corruptKey: string,
  fallbackContext: DeliveryContext,
): Promise<string> {
  // Try to reconstruct valid session key from context
  // Use chat ID, thread ID, channel to rebuild
  // Log recovery attempt for debugging
}
```

---

## Related Files to Check

Likely locations:
- `src/telegram/monitor/` - Message handling
- `src/cron/` - Reminder scheduling
- `src/routing/` - Delivery routing
- `src/agents/session-manager.ts` - Session state
- `src/telegram/bot-native-commands.ts` - Command parsing

---

**Status:** Documented, requires deep dive  
**Priority:** 🟠 High  
**Assigned:** Backend team
