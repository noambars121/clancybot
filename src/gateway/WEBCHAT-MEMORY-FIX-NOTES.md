# WebChat Memory Leak Fix - Implementation Notes

**Issue:** Browser crashes after prolonged use  
**Root Cause:** Chat history never clears, DOM nodes accumulate  
**Priority:** 🔴 Critical

---

## Problem

WebChat frontend accumulates chat messages indefinitely:
- No pagination
- No virtual scrolling
- DOM nodes never cleared
- Chrome crashes after hours of use

---

## Solution Required

### 1. Pagination (High Priority)
```typescript
// Load only N messages at a time
const MESSAGES_PER_PAGE = 50;

function loadPage(page: number) {
  const start = page * MESSAGES_PER_PAGE;
  const end = start + MESSAGES_PER_PAGE;
  return messages.slice(start, end);
}
```

### 2. Virtual Scrolling (High Priority)
```typescript
// Only render visible messages
// Use react-window or similar
<VirtualList
  height={600}
  itemCount={messages.length}
  itemSize={80}
  overscanCount={5}
/>
```

### 3. Cleanup Button (Medium Priority)
```typescript
// Add "Clear History" button
function clearHistory() {
  messages = [];
  // Clear from DOM
  chatContainer.innerHTML = '';
}
```

### 4. Memory Profiling (Low Priority)
- Add performance.memory monitoring
- Warn when memory > 500MB
- Auto-cleanup old messages

---

## Frontend Files to Modify

The WebChat frontend is likely in:
- `apps/web/` or `ui/` directory
- OR built separately and placed in `dist/control-ui/`

**TODO:** Locate the frontend source code and implement fixes

---

## Testing

1. Open WebChat in Chrome
2. Send 100+ messages
3. Check memory usage (DevTools → Memory)
4. Verify no crash after 8+ hours
5. Test pagination works
6. Test clear history works

---

**Status:** Documented, requires frontend work  
**Assigned:** Frontend team  
**Priority:** 🔴 Critical
