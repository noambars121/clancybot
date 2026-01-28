# 📱 PHASE 4: CHANNEL RELIABILITY

**Goal:** Fix channel-specific bugs and stability  
**Priority:** 🟠 High  
**Status:** Planning  
**Duration:** 4-6 days

---

## 🎯 Success Criteria

- [ ] WhatsApp QR timeout extended to 2 minutes
- [ ] Automatic reconnection on disconnect
- [ ] OAuth race condition fixed
- [ ] Telegram reminders work without corruption
- [ ] Slack DMs trigger agent runs
- [ ] Discord cron events route correctly

---

## 📋 Issues to Fix (8 High Priority)

### 1. OAuth Race Condition 🔐
**Issue:** GitHub #2036  
**Severity:** 🟠 High

**Problem:**
```
Claude Code refreshes OAuth → Moltbot's token invalid
→ "OAuth token refresh failed"
→ Must re-login manually
```

**Fix:**
1. Detect stale tokens before use
2. Implement token coordination
3. Auto re-login flow
4. Better error messages
5. Token sync mechanism

**Files:**
- `src/providers/oauth-manager.ts` (new)
- `src/providers/anthropic-oauth.ts`
- `src/config/auth-profiles.ts`

---

### 2. WhatsApp Stability 📱
**Issue:** User reports  
**Severity:** 🟠 High

**Problems:**
- QR expires too fast (30s)
- Frequent disconnects
- Doesn't work on Bun
- Camera permissions

**Fix:**
1. Extend QR timeout to 120s
2. Implement auto-reconnect
3. Better error handling
4. Connection monitoring
5. Stability improvements

**Files:**
- `src/web/auto-reply/monitor.ts`
- `src/web/client.ts`
- Add reconnection logic

---

### 3. Telegram Reminder Corruption 🤖
**Issue:** GitHub #3343  
**Severity:** 🟠 High

**Problem:**
```
Natural-language reminders corrupt session
→ sessionKey=unknown
→ Cannot recover
```

**Fix:**
1. Debug reminder flow
2. Fix session key handling
3. Add validation
4. Recovery mechanism
5. Better error handling

**Files:**
- `src/telegram/monitor/reminders.ts`
- `src/telegram/session-handling.ts`

---

### 4. Slack DM Not Triggering 💬
**Issue:** GitHub #3327  
**Severity:** 🟠 High

**Problem:**
```
Slack DMs get 👀 reaction but don't run agent
→ Message acknowledged
→ No response
```

**Fix:**
1. Debug DM routing
2. Fix agent trigger
3. Add logging
4. Test DM flow

**Files:**
- `src/slack/monitor/message-handler.ts`
- `src/slack/dm-routing.ts`

---

### 5. Discord Cron Routing ⏰
**Issue:** GitHub #3333  
**Severity:** 🟠 High

**Problem:**
```
Cron events processed but not delivered to Discord
→ Agent runs
→ No message sent
```

**Fix:**
1. Debug cron routing
2. Fix Discord delivery
3. Add retry logic
4. Test end-to-end

**Files:**
- `src/cron/router.ts`
- `src/discord/sender.ts`

---

### 6. WhatsApp Media Download 📷
**Issue:** GitHub #3375  
**Severity:** 🟡 Medium

**Problem:**
```
Media from other group members not downloaded
→ When using groupPolicy: allowlist
```

**Fix:**
1. Fix media download logic
2. Handle allowlist properly
3. Test group scenarios

---

### 7. NextCloud Talk Signature ✍️
**Issue:** GitHub #3388  
**Severity:** 🟡 Medium

**Problem:**
```
Signature computed incorrectly
→ Signs JSON body instead of message text
```

**Fix:**
1. Fix signature calculation
2. Test with NextCloud
3. Add validation

---

### 8. Browser Relay Attachment 🌐
**Issue:** GitHub #3331  
**Severity:** 🟡 Medium

**Problem:**
```
Can only attach from extension options page
→ Should work from any page
```

**Fix:**
1. Fix extension attachment
2. Test from different pages
3. Better error messages

---

## 📊 Plan Breakdown

### Plan 01: OAuth Race Fix
**Duration:** 1 day  
**Files:** 3 new, 2 modified

### Plan 02: WhatsApp Stability
**Duration:** 1-2 days  
**Files:** 4 modified

### Plan 03: Telegram Reminders
**Duration:** 1 day  
**Files:** 2 modified

### Plan 04: Slack DM Routing
**Duration:** 0.5 day  
**Files:** 2 modified

### Plan 05: Discord Cron Routing
**Duration:** 0.5 day  
**Files:** 2 modified

### Plan 06: Minor Channel Fixes
**Duration:** 1 day  
**Files:** 6 modified

---

## 🎯 Execution Order

**Week 2:**
- Days 1: OAuth race condition
- Days 2-3: WhatsApp stability
- Day 4: Telegram + Slack
- Day 5: Discord + minor fixes
- Day 6: Testing all channels

---

## ✅ Expected Outcomes

**Before:**
```
WhatsApp: disconnects, QR expires fast
OAuth: race condition, manual re-login
Telegram: reminders corrupt sessions
Slack: DMs ignored
Discord: cron fails
```

**After:**
```
WhatsApp: stable, auto-reconnect ✅
OAuth: coordinated, auto re-login ✅
Telegram: reminders work ✅
Slack: DMs trigger agent ✅
Discord: cron delivers ✅
```

**Score Impact:**
```
Channels: 65 → 90 (+25)
```

---

*Phase 4 Planning Complete*  
*Ready after Phase 3*  
*Estimated: 5-6 days*
