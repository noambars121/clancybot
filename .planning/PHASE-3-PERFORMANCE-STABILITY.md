# 🚀 PHASE 3: PERFORMANCE & STABILITY FIXES

**Goal:** Fix critical performance and stability issues  
**Priority:** 🔴 Critical (Blocking Production)  
**Status:** Planning  
**Duration:** 3-5 days

---

## 🎯 Success Criteria

- [ ] Session files stay under 500KB
- [ ] Web UI runs for 8+ hours without crash
- [ ] Auto-compaction works reliably
- [ ] No unhandled promise rejections
- [ ] Gateway uptime > 99%

---

## 📋 Issues to Fix (3 Critical)

### 1. Session File Bloat 💾
**Issue:** GitHub #1808  
**Severity:** 🔴 Critical  
**Impact:** Bot dies after 35 messages

**Root Cause:**
```typescript
// Gateway tool returns ENTIRE config schema (396KB) every call
// Session files: 2-3MB after hours
// Context overflow: 208k tokens > 200k limit
```

**Fix Plan:**
1. Prune gateway tool responses (remove config schema)
2. Implement session size limits (max 1MB)
3. Improve auto-compaction
4. Add session cleanup on overflow
5. Cache config schema (don't repeat)

**Files to Change:**
- `src/agents/tools/gateway.ts` - prune responses
- `src/agents/pi-embedded-runner/compact.ts` - better compaction
- `src/agents/session-manager.ts` - size limits

---

### 2. Web UI Memory Leak 💥
**Issue:** AnswerOverflow report  
**Severity:** 🔴 Critical  
**Impact:** Browser crashes

**Root Cause:**
```typescript
// Chat history never clears
// DOM nodes accumulate infinitely
// Chrome crashes after prolonged use
```

**Fix Plan:**
1. Implement pagination (load 50 messages at a time)
2. Clear old messages from DOM
3. Add "Clear History" button
4. Implement virtual scrolling
5. Memory profiling and cleanup

**Files to Change:**
- `src/gateway/control-ui.ts` - pagination
- WebChat frontend - virtual scroll
- Add cleanup interval

---

### 3. Cost Explosion 💰
**Issue:** Hacker News reports  
**Severity:** 🔴 Critical  
**Impact:** $300 in 2 days, users angry

**Root Cause:**
```typescript
// No token budgets
// No cost warnings
// Session bloat causes massive context
// No usage limits
```

**Fix Plan:**
1. Implement token budget system
2. Add cost estimation before runs
3. Usage warnings at 50%, 80%, 100%
4. Rate limit tool calls
5. Optimize session size (fix #1)

**Files to Create:**
- `src/security/token-budget.ts`
- `src/security/cost-estimator.ts`
- `src/security/usage-monitor.ts`

**Config Schema:**
```typescript
security: {
  tokenBudget: {
    enabled: boolean;
    dailyLimit: number;      // tokens per day
    warningThreshold: 0.8;   // warn at 80%
    hardLimit: boolean;      // stop at limit
  }
}
```

---

## 📊 Plan Breakdown

### Plan 01: Session Bloat Fix
**Duration:** 1-2 days  
**Priority:** 🔴 Critical

**Tasks:**
1. Analyze gateway tool responses
2. Prune config schema from responses
3. Implement session size limits
4. Improve auto-compaction
5. Add overflow cleanup
6. Test with Telegram bot (35+ messages)

---

### Plan 02: Web UI Memory Fix
**Duration:** 1 day  
**Priority:** 🔴 Critical

**Tasks:**
1. Add pagination (50 msgs/page)
2. Implement virtual scrolling
3. Clear old DOM nodes
4. Add "Clear History" button
5. Memory profiling
6. Test with long-running sessions

---

### Plan 03: Cost Control System
**Duration:** 1-2 days  
**Priority:** 🔴 Critical

**Tasks:**
1. Design token budget schema
2. Create cost estimator
3. Add usage monitor
4. Implement warnings (50/80/100%)
5. Add hard limits option
6. Dashboard integration

---

## 🎯 Execution Order

**Week 1:**
- Days 1-2: Plan 01 (Session Bloat)
- Day 3: Plan 02 (Web UI Memory)
- Days 4-5: Plan 03 (Cost Control)

**Testing:** Day 6
**Documentation:** Day 7

---

## ✅ Expected Outcomes

**Before:**
```
Session files: 2-3MB → bot dies
Web UI: crashes after hours
Costs: $300 in 2 days, no warnings
```

**After:**
```
Session files: <500KB ✅
Web UI: stable 8+ hours ✅
Costs: budgets + warnings ✅
```

**Score Impact:**
```
Performance: 40 → 85 (+45)
Stability:   55 → 85 (+30)
Cost Control: 30 → 90 (+60)
```

---

## 📝 Notes

- Session bloat is **show stopper** - highest priority
- Web UI affects user experience directly
- Cost control prevents user backlash
- All 3 must be fixed before production

---

*Phase 3 Planning Complete*  
*Ready for execution*  
*Estimated: 5-7 days*
