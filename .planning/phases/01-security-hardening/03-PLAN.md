---
plan_id: 03-file-permissions
phase: 1
wave: 1
autonomous: true
---

# File Permission Enforcement

## Goal

Enforce secure file permissions (0o600 for files, 0o700 for directories) on all sensitive paths.

## Context

Currently, state directories and config files may have loose permissions, exposing secrets. We need to:
1. Create permission enforcement service
2. Run on gateway startup
3. Add to doctor command
4. Audit and fix all sensitive paths

## Tasks

### Task 1: Create Permission Enforcer Service

**New file:** `src/security/permission-enforcer.ts`

```typescript
import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveConfigPath, resolveStateDir } from "../config/paths.js";

export interface PermissionIssue {
  path: string;
  current: string;
  expected: string;
  problem: string;
}

const EXPECTED_DIR_MODE = 0o700;
const EXPECTED_FILE_MODE = 0o600;

async function getPermissionMode(filePath: string): Promise<number> {
  try {
    const stats = await fs.stat(filePath);
    return stats.mode & 0o777;
  } catch {
    return -1; // Path doesn't exist
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

export async function auditPermissions(env?: NodeJS.ProcessEnv): Promise<PermissionIssue[]> {
  const issues: PermissionIssue[] = [];
  const stateDir = resolveStateDir(env);
  const configPath = resolveConfigPath(env, stateDir);

  const criticalPaths = [
    { path: stateDir, isDir: true },
    { path: configPath, isDir: false },
    { path: path.join(stateDir, 'credentials'), isDir: true },
    { path: path.join(stateDir, 'agents'), isDir: true },
    { path: path.join(stateDir, 'keys'), isDir: true },
    { path: path.join(stateDir, 'logs'), isDir: true },
  ];

  for (const { path: p, isDir } of criticalPaths) {
    if (!(await pathExists(p))) {
      continue; // Skip non-existent paths
    }

    const currentMode = await getPermissionMode(p);
    if (currentMode === -1) continue;

    const expectedMode = isDir ? EXPECTED_DIR_MODE : EXPECTED_FILE_MODE;
    
    if (currentMode !== expectedMode) {
      issues.push({
        path: p,
        current: currentMode.toString(8),
        expected: expectedMode.toString(8),
        problem: `${isDir ? 'Directory' : 'File'} has insecure permissions`,
      });
    }
  }

  // Check all files in credentials directory
  const credsDir = path.join(stateDir, 'credentials');
  if (await pathExists(credsDir)) {
    const files = await fs.readdir(credsDir);
    for (const file of files) {
      const filePath = path.join(credsDir, file);
      if (await isDirectory(filePath)) continue;

      const currentMode = await getPermissionMode(filePath);
      if (currentMode !== EXPECTED_FILE_MODE) {
        issues.push({
          path: filePath,
          current: currentMode.toString(8),
          expected: EXPECTED_FILE_MODE.toString(8),
          problem: 'Credential file has insecure permissions',
        });
      }
    }
  }

  return issues;
}

export async function enforceSecurePermissions(env?: NodeJS.ProcessEnv): Promise<number> {
  let fixed = 0;
  const stateDir = resolveStateDir(env);
  const configPath = resolveConfigPath(env, stateDir);

  const criticalPaths = [
    { path: stateDir, mode: EXPECTED_DIR_MODE },
    { path: configPath, mode: EXPECTED_FILE_MODE },
    { path: path.join(stateDir, 'credentials'), mode: EXPECTED_DIR_MODE },
    { path: path.join(stateDir, 'agents'), mode: EXPECTED_DIR_MODE },
    { path: path.join(stateDir, 'keys'), mode: EXPECTED_DIR_MODE },
    { path: path.join(stateDir, 'logs'), mode: EXPECTED_DIR_MODE },
  ];

  for (const { path: p, mode } of criticalPaths) {
    if (!(await pathExists(p))) {
      // Create directory if it doesn't exist
      if (mode === EXPECTED_DIR_MODE) {
        await fs.mkdir(p, { recursive: true, mode });
        fixed++;
      }
      continue;
    }

    const currentMode = await getPermissionMode(p);
    if (currentMode !== mode) {
      await fs.chmod(p, mode);
      fixed++;
    }
  }

  // Fix all files in credentials directory
  const credsDir = path.join(stateDir, 'credentials');
  if (await pathExists(credsDir)) {
    const files = await fs.readdir(credsDir);
    for (const file of files) {
      const filePath = path.join(credsDir, file);
      if (await isDirectory(filePath)) continue;

      const currentMode = await getPermissionMode(filePath);
      if (currentMode !== EXPECTED_FILE_MODE) {
        await fs.chmod(filePath, EXPECTED_FILE_MODE);
        fixed++;
      }
    }
  }

  return fixed;
}

export async function ensureSecurePermissions(filePath: string, isDir: boolean): Promise<void> {
  const expectedMode = isDir ? EXPECTED_DIR_MODE : EXPECTED_FILE_MODE;
  
  if (!(await pathExists(filePath))) {
    if (isDir) {
      await fs.mkdir(filePath, { recursive: true, mode: expectedMode });
    }
    return;
  }

  const currentMode = await getPermissionMode(filePath);
  if (currentMode !== expectedMode) {
    await fs.chmod(filePath, expectedMode);
  }
}
```

### Task 2: Run on Gateway Startup

**File:** `src/gateway/boot.ts`

Add import at top:
```typescript
import { enforceSecurePermissions } from "../security/permission-enforcer.js";
```

Update boot function to enforce permissions early:

```typescript
export async function bootGateway(/* params */): Promise</* return type */> {
  // Early in boot sequence, before loading config
  try {
    const fixed = await enforceSecurePermissions();
    if (fixed > 0) {
      console.log(`Secured ${fixed} file system paths`);
    }
  } catch (error) {
    console.warn('Failed to enforce file permissions:', error);
    // Don't fail boot on permission errors
  }

  // ... rest of boot logic
}
```

### Task 3: Add to Doctor Command

**File:** `src/commands/doctor.ts`

Add import at top:
```typescript
import { auditPermissions, enforceSecurePermissions } from "../security/permission-enforcer.js";
```

Add permission check function:

```typescript
async function checkFilePermissions(): Promise<DiagnosticIssue[]> {
  const issues: DiagnosticIssue[] = [];
  
  try {
    const permIssues = await auditPermissions();
    
    for (const issue of permIssues) {
      issues.push({
        severity: 'warn',
        category: 'security',
        title: 'Insecure file permissions',
        detail: `${issue.path}: mode ${issue.current} (expected ${issue.expected})`,
        remediation: `Run: chmod ${issue.expected} "${issue.path}"`,
      });
    }
  } catch (error) {
    issues.push({
      severity: 'error',
      category: 'security',
      title: 'Failed to audit file permissions',
      detail: String(error),
      remediation: 'Check file system access and permissions',
    });
  }

  return issues;
}
```

Update `runDoctor()` to include permission checks and offer auto-fix:

```typescript
// Add to diagnostics gathering
const permIssues = await checkFilePermissions();
allIssues.push(...permIssues);

// After displaying all issues, offer to fix permissions
const criticalPermIssues = permIssues.filter(i => i.severity === 'warn');
if (criticalPermIssues.length > 0) {
  console.log('');
  const shouldFix = await confirm({
    message: `Fix ${criticalPermIssues.length} file permission issues automatically?`,
    default: true,
  });
  
  if (shouldFix) {
    const fixed = await enforceSecurePermissions();
    console.log(chalk.green(`✓ Fixed permissions on ${fixed} paths`));
  }
}
```

## Success Criteria

- [ ] Permission enforcer service created with audit and fix functions
- [ ] Gateway startup enforces permissions on critical paths
- [ ] Doctor command checks and offers to fix permissions
- [ ] Directories secured to 0o700
- [ ] Files secured to 0o600
- [ ] Non-existent paths handled gracefully

## Testing

```bash
# Test permission enforcer
pnpm test src/security/permission-enforcer.test.ts

# Integration test with doctor
pnpm test src/commands/doctor.test.ts

# Manual test
pnpm moltbot doctor
```
