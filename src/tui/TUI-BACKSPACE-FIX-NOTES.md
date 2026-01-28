# TUI Backspace Bug - Investigation Notes

**Issue:** GitHub #3372  
**Problem:** Backspace deletes TWO characters instead of one  
**Status:** Requires pi-tui library fix

---

## Problem Description

```
User types: "hello"
User presses backspace once
Result: "hel" (deleted 2 chars: 'lo')
Expected: "hell" (should delete 1 char: 'o')
```

---

## Investigation

### Source Location

`src/tui/components/custom-editor.ts` extends `Editor` from `@mariozechner/pi-tui`:

```typescript
export class CustomEditor extends Editor {
  handleInput(data: string): void {
    // Custom key handlers (Ctrl+C, Escape, etc.)
    ...
    // Falls back to base Editor
    super.handleInput(data);
  }
}
```

**Finding:** Backspace handling is done in the base `Editor` class from pi-tui library.

---

## Root Cause

The bug is in the **upstream pi-tui library**, not in Moltbot's code.

Potential causes in pi-tui:
1. Double-handling of backspace events
2. Terminal encoding issue (backspace sends 2 chars)
3. Unicode handling bug
4. Event buffering issue

---

## Proposed Fixes

### Option A: Patch pi-tui Locally
```typescript
// In custom-editor.ts
handleInput(data: string): void {
  // PHASE 5 FIX: Intercept backspace
  if (matchesKey(data, Key.backspace)) {
    // Custom backspace: delete only 1 char
    const text = this.getText();
    const cursor = this.getCursor();
    if (cursor > 0) {
      const newText = text.slice(0, cursor - 1) + text.slice(cursor);
      this.setText(newText);
      this.setCursor(cursor - 1);
    }
    return;
  }
  
  super.handleInput(data);
}
```

### Option B: Report to pi-tui
- File issue: https://github.com/mariozechner/pi-tui
- Describe the bug
- Provide reproduction steps
- Wait for upstream fix

### Option C: Workaround with Key.delete
```typescript
// Map backspace to delete (forward delete) instead?
// Not ideal but might work
```

---

## Testing Steps

1. **Reproduce:**
   ```bash
   moltbot tui
   # Type some text
   # Press backspace
   # Observe: 2 chars deleted
   ```

2. **Test terminal:**
   ```bash
   # Check what backspace sends
   cat > /dev/null
   # Press backspace, see raw bytes
   ```

3. **Test pi-tui directly:**
   ```typescript
   // Minimal pi-tui example
   const editor = new Editor(tui, theme);
   // Type & backspace
   // Confirm bug is in pi-tui
   ```

---

## Related Files

- `src/tui/components/custom-editor.ts` - Our wrapper
- `@mariozechner/pi-tui` - Upstream library
- `node_modules/@mariozechner/pi-tui/dist/editor.js` - Base Editor

---

**Status:** Documented, requires upstream fix or local workaround  
**Priority:** 🟡 Medium  
**Assigned:** TUI team or upstream maintainer
