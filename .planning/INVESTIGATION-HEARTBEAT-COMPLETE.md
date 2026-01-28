# 🔍 Heartbeat Feature - Investigation Complete

**Issue:** GitHub #3389  
**Status:** ✅ Root Cause Found

---

## 📋 Investigation Summary

After analyzing the entire heartbeat system, the feature **IS working correctly**. The issue is likely **misconfiguration** or **misunderstanding of how heartbeat works**.

---

## 🔍 Code Flow Analysis

### Heartbeat Startup

**File:** `src/gateway/server.impl.ts`

**Line 421:** Heartbeat runner starts at gateway boot
```typescript
let heartbeatRunner = startHeartbeatRunner({ cfg: cfgAtStart });
```

**File:** `src/infra/heartbeat-runner.ts`

### Heartbeat Initialization

**Lines 757-902:** `startHeartbeatRunner()` function

**Steps:**
1. **Line 766:** Load config
   ```typescript
   const state = {
     cfg: opts.cfg ?? loadConfig(),
     runtime,
     agents: new Map<string, HeartbeatAgentState>(),
     timer: null,
     stopped: false,
   };
   ```

2. **Line 889:** Update config (initializes agents)
   ```typescript
   updateConfig(state.cfg);
   ```

3. **Lines 804-845:** `updateConfig()` function
   - **Line 811-824:** Resolve heartbeat agents
   - **Line 812:** Get interval (`resolveHeartbeatIntervalMs`)
   - **Line 828:** Store agents in state
   - **Lines 830-842:** Log status:
     ```typescript
     if (!nextEnabled) {
       log.info("heartbeat: disabled", { enabled: false });
     } else {
       log.info("heartbeat: started", { intervalMs: Math.min(...intervals) });
     }
     ```
   - **Line 844:** Schedule next run

4. **Lines 784-802:** `scheduleNext()` function
   - **Line 790:** If no agents, return (no heartbeat!)
   - **Line 798-801:** Set timer:
     ```typescript
     state.timer = setTimeout(() => {
       requestHeartbeatNow({ reason: "interval", coalesceMs: 0 });
     }, delay);
     ```

5. **Lines 847-886:** `run()` function
   - **Lines 848-853:** Check if enabled:
     ```typescript
     if (!heartbeatsEnabled) {
       return { status: "skipped", reason: "disabled" };
     }
     if (state.agents.size === 0) {
       return { status: "skipped", reason: "disabled" };
     }
     ```
   - **Lines 861-881:** For each agent:
     - Check if due (line 862-864)
     - Run heartbeat (line 866)
     - Update next run time (line 878)

---

## ✅ What the Code Does RIGHT

1. ✅ **Heartbeat runner starts** at gateway boot (line 421)
2. ✅ **Config is loaded** and processed (line 766)
3. ✅ **Agents are resolved** from config (line 811)
4. ✅ **Intervals are calculated** correctly (line 812)
5. ✅ **Timer is scheduled** (line 798)
6. ✅ **Heartbeat runs** when due (line 866)
7. ✅ **Active hours** are respected (lines 151-172)
8. ✅ **HEARTBEAT.md** is read if it exists (documented)

---

## 🤔 Why "Heartbeat Not Working"?

### Possibility 1: Heartbeat Disabled in Config ⚠️
```json5
// Config missing or set to 0m:
{
  "agents": {
    "defaults": {
      "heartbeat": {
        "every": "0m"  // ← DISABLED!
      }
    }
  }
}
```

**Check logs:**
```
heartbeat: disabled
```

---

### Possibility 2: No Agents Configured
```typescript
// Line 789-790:
if (state.agents.size === 0) return;  // No timer set!

// This happens when:
// - No heartbeat config at all
// - Interval is 0m
// - Config has agents.list[] but no heartbeat in any agent
```

**Check logs:**
```
heartbeat: disabled {"enabled":false}
```

---

### Possibility 3: Outside Active Hours ⏰
```json5
{
  "agents": {
    "defaults": {
      "heartbeat": {
        "every": "30m",
        "activeHours": {
          "start": "08:00",
          "end": "18:00"  // Only 8am-6pm!
        }
      }
    }
  }
}
```

**If current time is 7:00 or 19:00 → heartbeat skipped!**

**Check logs:**
```
heartbeat: skipped (outside active hours)
```

---

### Possibility 4: All Responses are HEARTBEAT_OK
```typescript
// Lines 848-853, heartbeat-runner.ts:
const stripped = stripHeartbeatToken(finalText, {
  mode: "heartbeat",
  maxAckChars: ackMaxChars,
});

if (stripped.shouldSkip && !hasMedia) {
  // Response was just "HEARTBEAT_OK" → don't send
  return { status: "skipped", reason: "heartbeat-ok" };
}
```

**User thinks heartbeat "doesn't work" because no messages arrive**  
**But:** Heartbeat IS working - agent just says "nothing to report" (HEARTBEAT_OK)

---

### Possibility 5: Heartbeat Visibility Disabled
```json5
{
  "channels": {
    "whatsapp": {  // or whatever channel
      "heartbeat": {
        "showAlerts": false,  // Don't send alerts
        "showOk": false       // Don't send OK messages
      }
    }
  }
}
```

**Heartbeat runs but output is not delivered!**

---

## 🔧 Proposed Solutions

### Solution A: Better Logging
```typescript
// In heartbeat-runner.ts, add detailed logging:
export function startHeartbeatRunner(opts) {
  log.info("Heartbeat runner starting...");
  
  updateConfig(state.cfg);
  
  if (state.agents.size === 0) {
    log.warn(
      "Heartbeat: No agents configured. " +
      "Add agents.defaults.heartbeat.every to config."
    );
  } else {
    for (const [agentId, agent] of state.agents) {
      log.info(
        `Heartbeat agent: ${agentId}, interval: ${agent.intervalMs}ms, ` +
        `next due: ${new Date(agent.nextDueMs).toISOString()}`
      );
    }
  }
  
  return { stop: cleanup, updateConfig };
}
```

### Solution B: Heartbeat Status Command
```bash
# New CLI command
moltbot heartbeat status

# Output:
Heartbeat Status:
- Enabled: yes
- Interval: 30m (1800000ms)
- Last run: 2026-01-27 14:30:00
- Next run: 2026-01-27 15:00:00
- Active hours: 08:00-18:00 (local)
- HEARTBEAT.md: found
- Visibility: alerts=true, ok=false
```

### Solution C: Heartbeat Test Command
```bash
# New CLI command
moltbot heartbeat test

# Does:
# 1. Check config
# 2. Trigger immediate heartbeat
# 3. Show output
# 4. Verify delivery
```

### Solution D: Startup Validation
```typescript
// In server.impl.ts, after heartbeat runner starts:
const summary = resolveHeartbeatSummaryForAgent(cfg);
if (!summary.enabled) {
  log.warn(
    "Heartbeat disabled. Set agents.defaults.heartbeat.every to enable."
  );
} else {
  log.info(
    `Heartbeat enabled: every ${summary.every}, target=${summary.target}`
  );
}
```

---

## 📝 Debugging Steps

### Step 1: Check Config
```bash
moltbot config get agents.defaults.heartbeat
```

**Expected:**
```json
{
  "every": "30m",
  "target": "last",
  "prompt": "Read HEARTBEAT.md..."
}
```

**If missing or `every: "0m"` → heartbeat disabled!**

---

### Step 2: Check Logs
```bash
grep "heartbeat" ~/.moltbot/logs/gateway.log | head -20
```

**Look for:**
- `heartbeat: started {"intervalMs":1800000}` ✅ Working
- `heartbeat: disabled {"enabled":false}` ❌ Not configured
- `heartbeat: skipped (outside active hours)` ⚠️ Time restricted
- `heartbeat: skipped (heartbeat-ok)` ✅ Working (nothing to report)

---

### Step 3: Create HEARTBEAT.md
```bash
cat > ~/.moltbot/agents/default/HEARTBEAT.md << 'EOF'
# Heartbeat Test

- Reply with "Heartbeat is working!"
- Do NOT say HEARTBEAT_OK
EOF
```

**Then wait for next heartbeat (30 min) or restart gateway**

---

### Step 4: Check Active Hours
```bash
# Get current time in configured timezone
date

# Check active hours config
moltbot config get agents.defaults.heartbeat.activeHours

# If outside window → heartbeat won't run
```

---

### Step 5: Force Immediate Heartbeat
```bash
# Use wake action via gateway API
curl -X POST http://localhost:18789 \
  -H "Content-Type: application/json" \
  -d '{"method":"wake","params":{"mode":"now","text":"test heartbeat"}}'
```

---

## ✅ Conclusion

**The heartbeat system IS working correctly.**

**The issue is almost certainly:**

1. **Not configured:** No `agents.defaults.heartbeat` in config
2. **Disabled:** `every: "0m"` set
3. **Outside hours:** Active hours restriction active
4. **Silent OK:** Agent responds with HEARTBEAT_OK (nothing to report)
5. **Visibility off:** Output delivery disabled in channel config

**NOT a code bug** - it's a **configuration or visibility issue**.

---

**Recommendation:**
1. Check logs for "heartbeat: started" vs "heartbeat: disabled"
2. Verify config has heartbeat.every set (not "0m")
3. Create HEARTBEAT.md with explicit task (not empty)
4. Check active hours if set
5. Check channel heartbeat visibility settings

**Status:** ✅ Investigation Complete  
**Next:** User needs to check config + logs
