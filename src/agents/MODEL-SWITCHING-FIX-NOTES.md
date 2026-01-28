# Model Switching Runtime Fix - Investigation Notes

**Issue:** GitHub #3370  
**Problem:** Runtime model not updated when switching to Gemini  
**Status:** Requires specific reproduction steps

---

## Problem Description

User reports that when switching models (e.g., to Gemini), the **runtime** doesn't update to use the new model. The config may be updated, but the running agent continues using the old model.

---

## Investigation

### Model Selection System

**Model Selection:** `src/agents/model-selection.ts`
- Parses model refs (`provider/model`)
- Resolves configured models
- Handles model aliases

**Model Config:** `src/agents/models-config.ts`
- Loads model config
- Provider-specific normalization

**Agent Runtime:** `src/agents/pi-embedded-runner/run.ts`
- Runs agent with specified model
- May cache model selection

---

## Possible Root Causes

### 1. Config Not Reloaded
```typescript
// Old config cached in memory
const cfg = loadConfig(); // Called once
// Later: user switches model
// Runtime still uses old cfg

// FIX: Reload config on each agent run
```

### 2. Model Override Not Applied
```typescript
// User switches to Gemini
config.agents.defaults.model = "google/gemini-2.0-flash"

// But runtime uses per-agent override
config.agents.list[0].model = "anthropic/claude-3-5-sonnet"  // OLD

// FIX: Clear per-agent overrides OR update them too
```

### 3. Gateway Not Restarted
```
User switches model → config written → gateway not restarted
→ Gateway still uses old model in memory
```

### 4. Session Model Pinned
```typescript
// Session may pin a specific model
session.modelOverride = "anthropic/claude-3-5-sonnet"

// Even if config changes, session override wins
// FIX: Clear session overrides when model changes
```

---

## Proposed Fixes

### Option A: Reload Config on Each Run
```typescript
// In pi-embedded-runner/run.ts
export async function runEmbeddedPiAgent(...) {
  // PHASE 5 FIX: Always reload config to pick up model changes
  const cfg = loadConfig(); // Fresh config each run
  
  const modelRef = resolveDefaultModelForAgent({ cfg, agentId });
  // ... use modelRef
}
```

### Option B: Watch Config File
```typescript
import { watch } from "node:fs";

let cachedConfig = loadConfig();

watch(configPath, (event) => {
  if (event === "change") {
    log.info("Config changed, reloading...");
    cachedConfig = loadConfig();
  }
});
```

### Option C: Explicit Model Switch Command
```bash
# New CLI command
moltbot agent switch-model google/gemini-2.0-flash

# Does:
# 1. Update config
# 2. Clear session model overrides
# 3. Restart gateway (if running)
# 4. Confirm new model active
```

### Option D: Runtime Model Update
```typescript
// In agent message context
if (ctx.modelSwitch) {
  // User requested model switch
  const newModel = parseModelRef(ctx.modelSwitch);
  
  // Update config
  await updateConfig({
    "agents.defaults.model": newModel
  });
  
  // PHASE 5 FIX: Apply immediately to runtime
  runtime.currentModel = newModel;
  
  log.info(`Switched to ${newModel.provider}/${newModel.model}`);
}
```

---

## Testing Steps

### Step 1: Reproduce Bug
```bash
# Start gateway
moltbot gateway run

# In chat:
# "Switch to Gemini 2.0 Flash"
# Agent updates config

# Send another message
# Check logs - which model is actually used?
```

### Step 2: Check Config
```bash
# Before switch
moltbot config get agents.defaults.model
# After switch
moltbot config get agents.defaults.model
# Should be different
```

### Step 3: Check Runtime
```bash
# In logs, look for:
# "Using model: anthropic/claude-3-5-sonnet"
# vs
# "Using model: google/gemini-2.0-flash"
```

### Step 4: Test Fix
```bash
# Apply fix (reload config)
# Restart gateway
# Switch model again
# Verify runtime uses new model immediately
```

---

## Debugging Commands

```bash
# Check current model
moltbot config get agents.defaults.model

# Check session overrides
cat ~/.moltbot/sessions.json | jq '.[] | select(.modelOverride)'

# Check gateway process model
ps aux | grep moltbot-gateway
# Look for --model arg

# Restart gateway (Mac)
moltbot gateway restart
```

---

## Related Files

- `src/agents/model-selection.ts` - Model resolution
- `src/agents/pi-embedded-runner/run.ts` - Agent runtime
- `src/config/io.ts` - Config loading
- `src/gateway/server.impl.ts` - Gateway startup

---

**Status:** Documented, requires reproduction + fix  
**Priority:** 🟡 Medium  
**Assigned:** Agent runtime team

**Next Steps:**
1. Reproduce with specific model switch
2. Add logging to track model selection
3. Implement config reload OR watch
4. Test immediate model updates
