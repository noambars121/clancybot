---
plan_id: 02-sandbox-defaults
phase: 1
wave: 1
autonomous: true
---

# Sandbox-by-Default

## Goal

Change sandbox default mode from "off" to "non-main" and harden Docker security settings.

## Context

Currently, sandbox mode defaults to "off", meaning the main session runs with full host access. This is a HIGH security risk. We need to:
1. Change default to "non-main"
2. Harden Docker security settings
3. Add migration warnings for existing users

## Tasks

### Task 1: Add Sandbox Defaults Constant

**File:** `src/config/defaults.ts`

Add at end of file:

```typescript
export const DEFAULT_SANDBOX_CONFIG = {
  mode: 'non-main' as const,
  scope: 'session' as const,
  workspaceAccess: 'none' as const,
  docker: {
    readOnlyRoot: true,
    capDrop: ['ALL'],
    network: 'none',
    tmpfs: ['/tmp', '/var/tmp', '/run'],
    securityOpt: ['no-new-privileges'],
  },
} as const;
```

### Task 2: Update Sandbox Config Resolution

**File:** `src/agents/sandbox/config.ts`

Update line 142 to use new default:

```typescript
mode: agentSandbox?.mode ?? agent?.mode ?? DEFAULT_SANDBOX_CONFIG.mode,
```

Add import at top:
```typescript
import { DEFAULT_SANDBOX_CONFIG } from "../../config/defaults.js";
```

### Task 3: Harden Docker Container Creation

**File:** `src/agents/sandbox/docker.ts`

Update `buildSandboxCreateArgs()` around line 134 to enforce security options:

```typescript
// Always enforce these security options (non-overridable)
args.push("--security-opt", "no-new-privileges");

// Enforce cap-drop ALL if not already present
if (params.cfg.capDrop.length === 0) {
  args.push("--cap-drop", "ALL");
} else {
  for (const cap of params.cfg.capDrop) {
    args.push("--cap-drop", cap);
  }
  // Ensure ALL is included
  if (!params.cfg.capDrop.includes("ALL")) {
    args.push("--cap-drop", "ALL");
  }
}

// Verify no dangerous capabilities are added back
const dangerousCaps = ['SYS_ADMIN', 'SYS_PTRACE', 'SYS_MODULE', 'SYS_RAWIO', 'SYS_BOOT'];
// Note: This is defensive - current code doesn't add caps, only drops them
```

### Task 4: Add Migration Warning to Doctor

**File:** `src/commands/doctor.ts`

Add new check function before `runDoctor()`:

```typescript
async function checkSandboxMigration(config: MoltbotConfig): Promise<DiagnosticIssue[]> {
  const issues: DiagnosticIssue[] = [];
  
  const sandboxMode = config.agents?.defaults?.sandbox?.mode;
  
  if (sandboxMode === 'off') {
    issues.push({
      severity: 'warn',
      category: 'security',
      title: 'Sandbox mode explicitly disabled',
      detail:
        'Your config has sandbox.mode="off", which means all sessions run with full host access. ' +
        'Phase 1 security hardening changes the default to "non-main" for better security.',
      remediation:
        'Consider removing sandbox.mode="off" to use the new secure default, or explicitly set ' +
        'sandbox.mode="non-main" to isolate group/channel sessions.',
    });
  } else if (!sandboxMode) {
    issues.push({
      severity: 'info',
      category: 'security',
      title: 'Sandbox mode using new default',
      detail:
        'Your config will now use sandbox.mode="non-main" by default (changed from "off"). ' +
        'This means non-main sessions (groups, channels) will run in Docker containers.',
      remediation: 'No action needed. This is more secure. Ensure Docker is installed and running.',
    });
  }
  
  return issues;
}
```

Update `runDoctor()` to call this check:

```typescript
// Add to diagnostics gathering
const sandboxIssues = await checkSandboxMigration(config);
allIssues.push(...sandboxIssues);
```

### Task 5: Add Escape Detection Module

**New file:** `src/agents/sandbox/escape-detection.ts`

```typescript
export interface EscapeAttempt {
  pattern: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
}

const ESCAPE_PATTERNS: Array<{ regex: RegExp; desc: string; severity: EscapeAttempt['severity'] }> = [
  { regex: /\/proc\/sys\/kernel/, desc: 'Kernel parameter access', severity: 'high' },
  { regex: /\/sys\/fs\/cgroup/, desc: 'CGroup manipulation', severity: 'high' },
  { regex: /mount\s+-o\s+bind/, desc: 'Bind mount attempt', severity: 'high' },
  { regex: /\bunshare\b/, desc: 'Namespace unshare', severity: 'high' },
  { regex: /\bnsenter\b/, desc: 'Namespace enter', severity: 'high' },
  { regex: /\/dev\/sd[a-z]/, desc: 'Raw disk access', severity: 'high' },
  { regex: /docker\.sock/, desc: 'Docker socket access', severity: 'high' },
  { regex: /\bchroot\b/, desc: 'Chroot escape attempt', severity: 'medium' },
  { regex: /\/proc\/self\/exe/, desc: 'Process self-reference', severity: 'medium' },
];

export function detectEscapeAttempts(text: string): EscapeAttempt[] {
  const attempts: EscapeAttempt[] = [];
  
  for (const { regex, desc, severity } of ESCAPE_PATTERNS) {
    if (regex.test(text)) {
      attempts.push({
        pattern: regex.source,
        description: desc,
        severity,
      });
    }
  }
  
  return attempts;
}

export function hasEscapeAttempts(text: string): boolean {
  return ESCAPE_PATTERNS.some(({ regex }) => regex.test(text));
}
```

## Success Criteria

- [ ] DEFAULT_SANDBOX_CONFIG constant created with mode="non-main"
- [ ] Config resolution uses new default
- [ ] Docker security options enforced (no-new-privileges, cap-drop ALL)
- [ ] Doctor command warns about sandbox.mode="off"
- [ ] Escape detection module created and exported
- [ ] All sandbox tests pass

## Testing

```bash
# Test sandbox config resolution
pnpm test src/agents/sandbox/config.test.ts

# Test Docker security
pnpm test src/agents/sandbox/docker.test.ts

# Test escape detection
pnpm test src/agents/sandbox/escape-detection.test.ts
```
