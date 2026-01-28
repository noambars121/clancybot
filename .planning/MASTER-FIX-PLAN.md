# 🎯 MASTER FIX PLAN - כל הבעיות

**Created:** 2026-01-27  
**Status:** Planning Complete  
**Total Issues:** 87+  
**Total Phases:** 5 (3 completed + 2 new)

---

## 📊 Overview

| Phase | Focus | Issues | Priority | Duration | Status |
|-------|-------|--------|----------|----------|--------|
| **Phase 1** | Core Security | 9 | 🔴 Critical | 7 days | ✅ **Complete** |
| **Phase 2** | Security Enhancements | 2 | 🟠 High | 3 days | ✅ **Complete** |
| **Phase 2.5** | Prompt Injection | 5 | 🔴 Critical | 1 day | ✅ **Complete** |
| **Phase 3** | Performance & Stability | 3 | 🔴 Critical | 5-7 days | 📋 **Planned** |
| **Phase 4** | Channel Reliability | 8 | 🟠 High | 5-6 days | 📋 **Planned** |
| **Phase 5** | UX Improvements | 10+ | 🟡 Medium | 4-5 days | 📋 **Planned** |

**Total:** 37+ major issues across 5 phases  
**Remaining:** 50+ minor bugs (ongoing)

---

## ✅ Completed Phases (1, 2, 2.5)

### Phase 1: Core Security (✅ Complete)
**Duration:** 7 days  
**Score Impact:** 40 → 85 (+45 points)

**Fixed:**
- ✅ Gateway authentication bypass
- ✅ Rate limiting (5/5min)
- ✅ Secrets encryption (AES-256-GCM)
- ✅ File permissions (0o600/0o700)
- ✅ Sandbox defaults (non-main)
- ✅ Command validation
- ✅ DM policy enforcement
- ✅ Audit logging
- ✅ Security scoring

**Files:** 41 (12 modified, 29 new)

---

### Phase 2: Security Enhancements (✅ Complete)
**Duration:** 3 days  
**Score Impact:** 85 → 90 (+5 points)

**Fixed:**
- ✅ Rate limiter integration
- ✅ Session management
- ✅ Token expiration

**Files:** 8 (2 modified, 6 new)

---

### Phase 2.5: Prompt Injection (✅ Complete)
**Duration:** 1 day  
**Score Impact:** 90 → 95 (+5 points)

**Fixed:**
- ✅ Channel topic injection (Slack, Discord)
- ✅ Group name injection (Telegram)
- ✅ Display name injection (all channels)
- ✅ 15 injection patterns blocked
- ✅ Length limits enforced

**Files:** 7 (5 modified, 2 new)

---

## 📋 Planned Phases (3, 4, 5)

### Phase 3: Performance & Stability 🔴
**Duration:** 5-7 days  
**Priority:** Critical (Blocking Production)  
**Score Impact:** +45 performance, +30 stability

**Issues:**
1. 💾 **Session File Bloat** (#1808)
   - Session files → 2-3MB
   - Bot dies after 35 messages
   - Context overflow (208k > 200k tokens)
   - **Fix:** Prune gateway responses, size limits, better compaction

2. 💥 **Web UI Memory Leak**
   - Browser crashes after hours
   - Chat history never clears
   - **Fix:** Pagination, virtual scroll, cleanup

3. 💰 **Cost Explosion**
   - $300 in 2 days
   - 180M tokens in week
   - No warnings
   - **Fix:** Token budgets, cost estimation, usage warnings

**Files to Create:**
- `src/security/token-budget.ts`
- `src/security/cost-estimator.ts`
- `src/security/usage-monitor.ts`

**Files to Modify:**
- `src/agents/tools/gateway.ts` - prune responses
- `src/agents/pi-embedded-runner/compact.ts` - better compaction
- `src/gateway/control-ui.ts` - pagination
- WebChat frontend - virtual scroll

---

### Phase 4: Channel Reliability 🟠
**Duration:** 5-6 days  
**Priority:** High  
**Score Impact:** +25 channels

**Issues:**
1. 🔐 **OAuth Race Condition** (#2036)
   - Tokens become invalid
   - Must re-login manually
   - **Fix:** Token coordination, auto re-login

2. 📱 **WhatsApp Stability**
   - QR expires fast (30s)
   - Frequent disconnects
   - **Fix:** Extended timeout (120s), auto-reconnect

3. 🤖 **Telegram Reminders** (#3343)
   - Corrupt sessions
   - sessionKey=unknown
   - **Fix:** Debug flow, fix session handling

4. 💬 **Slack DM Ignored** (#3327)
   - Gets 👀 but no response
   - **Fix:** Debug routing, fix trigger

5. ⏰ **Discord Cron Routing** (#3333)
   - Events processed but not delivered
   - **Fix:** Debug routing, fix delivery

6. 📷 **WhatsApp Media** (#3375)
7. ✍️ **NextCloud Signature** (#3388)
8. 🌐 **Browser Relay** (#3331)

**Files to Create:**
- `src/providers/oauth-manager.ts`

**Files to Modify:**
- `src/web/auto-reply/monitor.ts` - WhatsApp
- `src/telegram/monitor/reminders.ts`
- `src/slack/monitor/message-handler.ts`
- `src/discord/sender.ts`
- `src/cron/router.ts`

---

### Phase 5: UX Improvements 🟡
**Duration:** 4-5 days  
**Priority:** Medium  
**Score Impact:** +25 UX

**Issues:**
1. ⌨️ **Keyboard Shortcuts** (#3412, #3413)
   - No Escape to stop
   - No delete session
   - **Fix:** Add keyboard handlers

2. 🌞 **Light Mode** (#3381)
   - Doesn't work at all
   - **Fix:** Fix CSS theme

3. ⌨️ **TUI Backspace** (#3372)
   - Deletes 2 chars
   - **Fix:** Fix input handling

4. 💓 **Heartbeat** (#3389)
   - Not working
   - **Fix:** Debug mechanism

5. 🔄 **Model Switching** (#3370)
   - Runtime not updated
   - **Fix:** Immediate update

6. 📑 **Session Navigation** (#3367)
7. 🍎 **Safari Drag & Drop** (#3349)
8. 🎫 **Onboarding Token** (#3384)
9. 🔧 **TUI Tool Output** (#3361)
10. 🎯 **Skills Display** (#3411)

**Files to Modify:**
- WebChat frontend - keyboard, theme, sessions
- `src/tui/input-handler.ts`
- `src/agents/heartbeat.ts`
- `src/agents/model-selection.ts`
- `src/commands/onboard.ts`

---

## 🎯 Execution Timeline

### Already Done (11 days)
```
Week 1 (Days 1-7):   Phase 1 - Core Security ✅
Week 2 (Days 8-10):  Phase 2 - Enhancements ✅
Week 2 (Day 11):     Phase 2.5 - Prompt Injection ✅
```

### Planned (16-18 days)
```
Week 3 (Days 12-18): Phase 3 - Performance (5-7 days) 📋
Week 4 (Days 19-24): Phase 4 - Channels (5-6 days) 📋
Week 5 (Days 25-29): Phase 5 - UX (4-5 days) 📋
```

**Total Project Duration:** ~29 days (4+ weeks)

---

## 📈 Score Progression

```
Initial State:
Security:     40/100 ❌
Performance:  40/100 ❌
Stability:    55/100 ⚠️
Cost Control: 30/100 ❌
UX:           60/100 ⚠️
Channels:     65/100 ⚠️
──────────────────────
Overall:      48/100 ❌ POOR

After Phase 1+2+2.5 (Current):
Security:     95/100 ✅
Performance:  40/100 ❌
Stability:    55/100 ⚠️
Cost Control: 30/100 ❌
UX:           60/100 ⚠️
Channels:     65/100 ⚠️
──────────────────────
Overall:      58/100 ⚠️ NEEDS WORK

After All Phases (Target):
Security:     95/100 ✅
Performance:  85/100 ✅
Stability:    85/100 ✅
Cost Control: 90/100 ✅
UX:           85/100 ✅
Channels:     90/100 ✅
──────────────────────
Overall:      88/100 ✅ EXCELLENT
```

**Improvement:** 48 → 88 (+40 points, +83%)

---

## 🚦 Phase Priority

### Must Do (Blocking Production)
1. ✅ Phase 1: Security
2. ✅ Phase 2: Security Enhancements
3. ✅ Phase 2.5: Prompt Injection
4. 📋 **Phase 3: Performance** ← **NEXT (Critical!)**

### Should Do (Important)
5. 📋 Phase 4: Channels
6. 📋 Phase 5: UX

### Nice to Have (Ongoing)
- Minor bugs (50+)
- Enhancements
- Documentation
- Tests

---

## 📝 Implementation Strategy

### Phase 3 (NOW - Critical!)
**Why First:** Session bloat is a **show stopper**  
**Impact:** Production-blocking  
**Duration:** 5-7 days

**Approach:**
1. Day 1-2: Fix session bloat (#1808)
2. Day 3: Fix Web UI memory leak
3. Day 4-5: Implement cost controls
4. Day 6: Testing
5. Day 7: Documentation

---

### Phase 4 (After Phase 3)
**Why Second:** Channel bugs affect daily use  
**Impact:** User satisfaction  
**Duration:** 5-6 days

**Approach:**
1. OAuth first (affects all)
2. WhatsApp (most reported)
3. Telegram, Slack, Discord
4. Minor channel fixes

---

### Phase 5 (After Phase 4)
**Why Last:** Polish, not blockers  
**Impact:** User experience  
**Duration:** 4-5 days

**Approach:**
1. Keyboard shortcuts (quick win)
2. Visual fixes
3. TUI improvements
4. Runtime fixes
5. Minor polish

---

## ✅ Success Metrics

### Technical
- [ ] All tests pass
- [ ] No linter errors
- [ ] Security score: 95/100 ✅
- [ ] Performance score: 85/100
- [ ] Stability: 99%+ uptime
- [ ] Cost controls active

### User Experience
- [ ] Session files < 500KB
- [ ] Web UI stable 8+ hours
- [ ] Costs under control ($5-20/month typical)
- [ ] Channels reliable
- [ ] UX polished

### Business
- [ ] Production-ready
- [ ] User complaints resolved
- [ ] Documentation complete
- [ ] Community satisfied

---

## 🎖️ Overall Status

**Completed:** 3 phases (Security)  
**Planned:** 3 phases (Performance, Channels, UX)  
**Progress:** 37% complete (11/29 days)

**Current State:** ⚠️ Not production-ready  
**After Phase 3:** ✅ Production-ready (with warnings)  
**After All Phases:** ✅ **Fully production-ready**

---

*Master Plan Created: 2026-01-27*  
*Ready to execute Phase 3*  
*Estimated completion: 4-5 weeks total*
