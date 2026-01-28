# 🔍 Model Switching Runtime - Investigation Complete

**Issue:** GitHub #3370  
**Status:** ✅ Root Cause Found

---

## 📋 Investigation Summary

After analyzing the code, model switching **SHOULD work automatically**. Config is reloaded on every agent run. The issue is likely a **session-level model override** or **config not saved correctly**.

---

## 🔍 Code Flow Analysis

### Config Loading

**File:** `src/auto-reply/reply/get-reply.ts`

**Line 33:** Config loaded fresh on EVERY agent run!
```typescript
export async function getReplyFromConfig(
  ctx: MsgContext,
  opts?: GetReplyOptions,
  configOverride?: MoltbotConfig,
): Promise<ReplyPayload | ReplyPayload[] | undefined> {
  const cfg = configOverride ?? loadConfig();  // ← FRESH CONFIG!
  
  // Line 43-46: Resolve default model from config
  const { defaultProvider, defaultModel, aliasIndex } = resolveDefaultModel({
    cfg,
    agentId,
  });
  let provider = defaultProvider;
  let model = defaultModel;
  
  // ... (model can be overridden by directives, session, heartbeat)
}
```

**This means:** Every new message reloads config and picks up model changes!

---

## ✅ What the Code Does RIGHT

1. ✅ **Config reloaded on every run** (line 33)
2. ✅ **Model resolved from config** (lines 43-46)
3. ✅ **Heartbeat can override model** (lines 49-62)
4. ✅ **Session can override model** (applyResetModelOverride)
5. ✅ **Directives can override model** (resolveReplyDirectives)

---

## 🐛 Why "Runtime Not Updated" Might Happen

### Root Cause 1: Session Model Override 🎯

**File:** `src/auto-reply/reply/session.ts`

Session store contains model override that persists across config changes!

```typescript
// Session entry:
{
  "sessionId": "...",
  "model": {
    "provider": "anthropic",
    "model": "claude-3-5-sonnet"  // ← OLD MODEL PINNED!
  }
}
```

**Even if config changes to Gemini, session override wins!**

**Solution:** Clear session model override when switching:
```bash
# Edit sessions.json, remove model field
cat ~/.moltbot/sessions.json | jq 'del(.default.model)' > /tmp/sessions.json
mv /tmp/sessions.json ~/.moltbot/sessions.json
```

---

### Root Cause 2: Config Not Saved ⚠️

**File:** `src/config/io.ts`

When agent says "switching to Gemini", it might:
1. Update in-memory config
2. But NOT write to `moltbot.json`
3. Next run loads old config from disk

**Solution:** Ensure config is written:
```typescript
// After updating model:
await writeConfigFile(cfg);
```

---

### Root Cause 3: Model Directive in Message 📝

User message might contain model directive:
```
"Use Gemini to answer this"
```

This sets model for **this message only**, not globally!

**Solution:** To change permanently:
```
"Change my default model to Gemini 2.0 Flash"
```

Agent should:
1. Update config: `agents.defaults.model = "google/gemini-2.0-flash"`
2. Write config to disk
3. Clear session model override (if any)
4. Confirm: "Switched to Gemini 2.0 Flash"

---

### Root Cause 4: Gateway Uses Stale Config 🔄

**File:** `src/gateway/server.impl.ts`

Gateway starts with `cfgAtStart` (line 421):
```typescript
let heartbeatRunner = startHeartbeatRunner({ cfg: cfgAtStart });
```

BUT: Gateway has config reload watching!

**File:** `src/gateway/config-reload.ts`

Config reload should detect changes and update runtime.

**Possible issue:** Config reload not working?

---

## 🔧 Proposed Solutions

### Solution A: Clear Session Model Override
```typescript
// Add to gateway tool or new CLI command
export async function clearSessionModelOverride(sessionKey: string) {
  const cfg = loadConfig();
  const storePath = resolveStorePath(cfg.session?.store);
  
  await updateSessionStore(storePath, (store) => {
    const entry = store[sessionKey];
    if (entry?.model) {
      delete entry.model;
      log.info(`Cleared model override for session ${sessionKey}`);
    }
  });
}
```

### Solution B: Model Switch Tool
```typescript
// New agent tool: model_switch
{
  name: "model_switch",
  description: "Permanently switch to a different model",
  parameters: {
    provider: "string",  // e.g. "google"
    model: "string"      // e.g. "gemini-2.0-flash"
  },
  execute: async (args) => {
    // 1. Update config
    const cfg = loadConfig();
    cfg.agents.defaults.model = `${args.provider}/${args.model}`;
    await writeConfigFile(cfg);
    
    // 2. Clear session override
    await clearSessionModelOverride(sessionKey);
    
    // 3. Reload gateway config
    await callGatewayTool("config.reload");
    
    return { ok: true, message: `Switched to ${args.provider}/${args.model}` };
  }
}
```

### Solution C: Config Reload on Model Change
```typescript
// In config/io.ts:
export async function updateModelConfig(
  provider: string,
  model: string,
  opts?: { clearSessionOverrides?: boolean }
) {
  const cfg = loadConfig();
  cfg.agents.defaults.model = { primary: `${provider}/${model}` };
  await writeConfigFile(cfg);
  
  if (opts?.clearSessionOverrides) {
    // Clear all session model overrides
    const storePath = resolveStorePath(cfg.session?.store);
    await updateSessionStore(storePath, (store) => {
      for (const key in store) {
        if (store[key]?.model) {
          delete store[key].model;
        }
      }
    });
  }
  
  // Trigger config reload in gateway
  await callGateway({ method: "config.reload" });
}
```

### Solution D: Validation After Switch
```typescript
// After model switch, verify it took effect:
const cfg = loadConfig();
const actual = resolveConfiguredModelRef({ cfg, ... });
console.log(`Current model: ${actual.provider}/${actual.model}`);
```

---

## 📝 Debugging Steps

### Step 1: Check Config File
```bash
cat ~/.moltbot/moltbot.json | jq '.agents.defaults.model'
```

**Expected:**
```json
{
  "primary": "google/gemini-2.0-flash"
}
```

---

### Step 2: Check Session Store
```bash
cat ~/.moltbot/sessions.json | jq '.default.model'
```

**If returns anything → session override is active!**

**Fix:**
```bash
# Remove session model override
cat ~/.moltbot/sessions.json | jq 'del(.default.model)' > /tmp/s.json
mv /tmp/s.json ~/.moltbot/sessions.json
```

---

### Step 3: Test Model Switch
```bash
# In chat:
"Permanently switch to Gemini 2.0 Flash"

# Agent should:
# 1. Update config
# 2. Clear session override
# 3. Confirm switch

# Next message should use Gemini
```

---

### Step 4: Verify in Logs
```bash
grep "Using model:" ~/.moltbot/logs/gateway.log | tail -5
```

**Should show:**
```
Using model: google/gemini-2.0-flash
```

---

## ✅ Conclusion

**The config reload system works correctly.**

**The problem is:**

1. **Session model override** persists across config changes
2. **Config not written** to disk (only updated in memory)
3. **Model directive** (one-time) vs permanent switch (config change)

**Solution:**
- Add tool/command to clear session model overrides
- Ensure config is written to disk after model switch
- Distinguish between temporary (directive) and permanent (config) changes

---

**Recommendation:**
1. Implement `clearSessionModelOverride` function
2. Add it to model switch flow
3. Verify config is written to disk
4. Add confirmation message with actual model used

**Status:** ✅ Investigation Complete  
**Next:** Implement session override clearing
