# 🎨 PHASE 5: UX IMPROVEMENTS

**Goal:** Fix user experience issues and missing features  
**Priority:** 🟡 Medium  
**Status:** Planning  
**Duration:** 3-4 days

---

## 🎯 Success Criteria

- [ ] Keyboard shortcuts work (stop generation, delete session)
- [ ] Light mode works properly
- [ ] TUI backspace works correctly
- [ ] Heartbeat feature works
- [ ] Model switching updates runtime
- [ ] Session navigation works correctly

---

## 📋 Issues to Fix (10+ UX)

### 1. Web UI Keyboard Shortcuts ⌨️
**Issues:** GitHub #3412, #3413  
**Severity:** 🟡 Medium

**Missing:**
- No keyboard shortcut to stop generation (Escape)
- No way to delete session (Del/Backspace)
- No keyboard navigation

**Fix:**
1. Add Escape → stop generation
2. Add Del/Backspace → delete session
3. Add Ctrl+N → new chat
4. Add Ctrl+K → focus input
5. Add arrows → navigate history

**Files:**
- WebChat frontend - keyboard handler
- `src/gateway/control-ui.ts`

---

### 2. Light Mode Broken 🌞
**Issue:** GitHub #3381  
**Severity:** 🟡 Medium

**Problem:**
```
Light mode doesn't work at all
→ Always dark mode
```

**Fix:**
1. Fix CSS theme switching
2. Test light mode colors
3. Add theme persistence
4. Better contrast

**Files:**
- WebChat styles
- Theme configuration

---

### 3. TUI Backspace Bug ⌨️
**Issue:** GitHub #3372  
**Severity:** 🟡 Medium

**Problem:**
```
Backspace deletes TWO characters instead of one!
```

**Fix:**
1. Debug TUI input handling
2. Fix backspace logic
3. Test with different terminals

**Files:**
- `src/tui/input-handler.ts`
- `src/tui/components/custom-editor.ts`

---

### 4. Heartbeat Not Working 💓
**Issue:** GitHub #3389  
**Severity:** 🟡 Medium

**Problem:**
```
HEARTBEAT.md feature not working as documented
```

**Fix:**
1. Debug heartbeat mechanism
2. Fix scheduling
3. Update documentation
4. Test heartbeat flow

**Files:**
- `src/agents/heartbeat.ts`
- `docs/heartbeat.md`

---

### 5. Model Switching Runtime 🔄
**Issue:** GitHub #3370  
**Severity:** 🟡 Medium

**Problem:**
```
Runtime model not updated when switching to Gemini
→ Still uses old model
```

**Fix:**
1. Fix model switching logic
2. Update runtime immediately
3. Add confirmation message

**Files:**
- `src/agents/model-selection.ts`
- `src/agents/runtime.ts`

---

### 6. Sessions Tab Navigation 📑
**Issue:** GitHub #3367  
**Severity:** 🟡 Medium

**Problem:**
```
Clicking session navigates to wrong session
DM topics missing thread ID
```

**Fix:**
1. Fix session ID routing
2. Add thread IDs to topics
3. Test navigation

**Files:**
- WebChat sessions tab
- `src/gateway/session-utils.ts`

---

### 7. Safari Drag & Drop 🍎
**Issue:** GitHub #3349  
**Severity:** 🟡 Medium

**Problem:**
```
Safari WebChat: Drag & drop from screenshot fails
→ "file not found"
```

**Fix:**
1. Fix Safari file handling
2. Test screenshot thumbnails
3. Better error messages

---

### 8. Onboarding Token Bug 🎫
**Issue:** GitHub #3384  
**Severity:** 🟡 Medium

**Problem:**
```
Leaving token blank creates token "undefined"
```

**Fix:**
1. Validate token input
2. Handle empty strings
3. Better error messages

**Files:**
- `src/commands/onboard.ts`
- Onboarding flow

---

### 9. TUI Tool Output 🔧
**Issue:** GitHub #3361  
**Severity:** 🟡 Low

**Problem:**
```
TUI shows "(no output)" for tool-only assistant turns
```

**Fix:**
1. Better tool result formatting
2. Show "Tool executed: X"
3. Hide "(no output)" noise

---

### 10. Skills Display 🎯
**Issue:** GitHub #3411  
**Severity:** 🟡 Low

**Problem:**
```
Dashboard shows skill as "blocked" despite working
```

**Fix:**
1. Fix skill status detection
2. Better error messages
3. Refresh status

---

## 📊 Plan Breakdown

### Plan 01: Keyboard Shortcuts
**Duration:** 1 day  
**Impact:** High UX improvement

### Plan 02: Visual Fixes (Light Mode, Navigation)
**Duration:** 1 day  
**Impact:** User satisfaction

### Plan 03: TUI Improvements
**Duration:** 0.5 day  
**Impact:** Terminal users

### Plan 04: Runtime Fixes (Heartbeat, Model Switch)
**Duration:** 1 day  
**Impact:** Core functionality

### Plan 05: Minor UX Fixes
**Duration:** 0.5 day  
**Impact:** Polish

---

## 🎯 Execution Order

**Week 3:**
- Day 1: Keyboard shortcuts
- Day 2: Light mode + sessions nav
- Day 3: TUI + Safari fixes
- Day 4: Heartbeat + model switching
- Day 5: Minor fixes + polish

---

## ✅ Expected Outcomes

**Before:**
```
No keyboard shortcuts
Light mode broken
TUI backspace bug
Heartbeat doesn't work
Model switching broken
Navigation bugs
```

**After:**
```
Keyboard shortcuts ✅
Light mode works ✅
TUI backspace fixed ✅
Heartbeat works ✅
Model switching instant ✅
Navigation perfect ✅
```

**Score Impact:**
```
UX: 60 → 85 (+25)
```

---

*Phase 5 Planning Complete*  
*Ready after Phase 4*  
*Estimated: 4-5 days*
