# Heartbeat Feature Fix - Investigation Notes

**Issue:** GitHub #3389  
**Problem:** HEARTBEAT.md feature not working as documented  
**Status:** Requires specific reproduction steps

---

## Problem Description

User reports that "heartbeat feature doesn't work" but no specific details provided.

Possible issues:
1. Heartbeats not firing
2. HEARTBEAT.md not being read
3. Heartbeat responses not being sent
4. Heartbeat configuration not working
5. Heartbeat timing/scheduling issues

---

## Investigation

### Code Review

**Heartbeat Runner:** `src/web/auto-reply/heartbeat-runner.ts`
- ✅ Implements heartbeat logic
- ✅ Reads config
- ✅ Strips HEARTBEAT_OK token
- ✅ Handles visibility settings
- ✅ Sends messages via WhatsApp

**Configuration:** Documented in `docs/gateway/heartbeat.md`
- ✅ Default interval: 30m
- ✅ Config schema defined
- ✅ Target resolution
- ✅ Active hours support

**System Prompt:** Should include "Read HEARTBEAT.md if it exists"

---

## Possible Root Causes

### 1. Config Not Set Correctly
```json5
// Missing or misconfigured
{
  "agents": {
    "defaults": {
      "heartbeat": {
        "every": "30m",    // Check this exists
        "target": "last",  // Check valid
      }
    }
  }
}
```

### 2. HEARTBEAT.md Not in Workspace
```bash
# Check if file exists
ls ~/.moltbot/agents/<agent-id>/HEARTBEAT.md

# If missing, create it
cat > ~/.moltbot/agents/default/HEARTBEAT.md << 'EOF'
# Keep this file empty to skip heartbeat API calls.
# Add tasks below when you want the agent to check something periodically.
EOF
```

### 3. Heartbeat Disabled
```bash
# Check config
moltbot config get agents.defaults.heartbeat.every
# Should be "30m" or similar, not "0m"
```

### 4. Active Hours Restriction
```json5
{
  "agents": {
    "defaults": {
      "heartbeat": {
        "activeHours": {
          "start": "08:00",
          "end": "18:00"  // Only fires during these hours
        }
      }
    }
  }
}
```

### 5. Heartbeat Visibility Disabled
```json5
{
  "channels": {
    "whatsapp": {
      "heartbeat": {
        "showAlerts": false,  // Alerts disabled!
        "showOk": false       // OK messages disabled!
      }
    }
  }
}
```

---

## Debugging Steps

### Step 1: Enable Verbose Logging
```bash
CLAWDBOT_VERBOSE=1 moltbot gateway run
```

### Step 2: Check Config
```bash
moltbot config get agents.defaults.heartbeat
```

### Step 3: Create HEARTBEAT.md
```bash
cat > ~/.moltbot/agents/default/HEARTBEAT.md << 'EOF'
# Test heartbeat
- Check if I can read this file
- Reply with "Heartbeat test successful"
EOF
```

### Step 4: Monitor Logs
```bash
tail -f ~/.moltbot/logs/gateway.log | grep heartbeat
```

### Step 5: Check Heartbeat Events
```bash
# Look for heartbeat events in logs
grep "heartbeat" ~/.moltbot/logs/*.log
```

---

## Proposed Fixes

### Option A: Better Error Messages
```typescript
// In heartbeat-runner.ts
if (!cfg.agents?.defaults?.heartbeat) {
  throw new Error("Heartbeat not configured. Add agents.defaults.heartbeat to config.");
}

if (cfg.agents.defaults.heartbeat.every === "0m") {
  heartbeatLogger.info("Heartbeat disabled (every: 0m)");
  return;
}
```

### Option B: Heartbeat Status Command
```bash
# New CLI command
moltbot heartbeat status
# Shows:
# - Enabled: yes/no
# - Interval: 30m
# - Last run: 2026-01-27 14:30:00
# - Next run: 2026-01-27 15:00:00
# - HEARTBEAT.md: found/missing
```

### Option C: Validate HEARTBEAT.md Access
```typescript
// Check if workspace file is readable
import { access } from "node:fs/promises";

const heartbeatPath = path.join(workspaceDir, "HEARTBEAT.md");
try {
  await access(heartbeatPath);
  heartbeatLogger.info("HEARTBEAT.md found");
} catch {
  heartbeatLogger.warn("HEARTBEAT.md not found, using default prompt");
}
```

---

## Testing

1. **Fresh install test:**
   ```bash
   moltbot config set agents.defaults.heartbeat.every "1m"
   moltbot gateway run
   # Wait 1 minute
   # Check if heartbeat fires
   ```

2. **HEARTBEAT.md test:**
   ```bash
   echo "- Test task" > ~/.moltbot/agents/default/HEARTBEAT.md
   # Trigger heartbeat
   # Check if agent mentions "Test task"
   ```

3. **Visibility test:**
   ```bash
   moltbot config set channels.whatsapp.heartbeat.showAlerts false
   # Heartbeats should not send alerts
   ```

---

## Related Files

- `src/web/auto-reply/heartbeat-runner.ts` - Main runner
- `src/auto-reply/heartbeat.ts` - Core heartbeat logic
- `src/infra/heartbeat-events.ts` - Event emission
- `src/infra/heartbeat-visibility.ts` - Visibility logic
- `docs/gateway/heartbeat.md` - Documentation

---

**Status:** Documented, requires specific reproduction  
**Priority:** 🟡 Medium  
**Assigned:** Heartbeat feature team

**Next Steps:**
1. Ask reporter for specific steps to reproduce
2. Test with fresh config
3. Add better logging/error messages
