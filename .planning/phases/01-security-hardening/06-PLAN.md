---
plan_id: 06-command-validation
phase: 1
wave: 2
autonomous: true
---

# Command Execution Validation

## Goal

Add comprehensive validation for all command execution paths to prevent command injection vulnerabilities.

## Tasks

### Task 1: Validate Docker Setup Commands

**File:** `src/agents/sandbox/docker.ts`

Add validation function before line 206:

```typescript
import { analyzeShellCommand } from "../../infra/exec-approvals.js";

function validateSetupCommand(command: string): void {
  if (!command || !command.trim()) {
    return; // Empty command is OK
  }
  
  const analysis = analyzeShellCommand(command);
  if (!analysis.ok) {
    throw new Error(
      `Dangerous Docker setup command rejected: ${analysis.reason}\n` +
      `Command: ${command}`
    );
  }
  
  // Additional restrictions for setup commands
  const forbidden = ['curl', 'wget', 'git', 'apt', 'yum', 'dnf', 'pip', 'npm'];
  const commandLower = command.toLowerCase();
  
  for (const cmd of forbidden) {
    if (commandLower.includes(cmd)) {
      throw new Error(
        `Docker setup command cannot include network tools: ${cmd}\n` +
        `Command: ${command}\n` +
        `Reason: Setup commands run during container creation and should not fetch external content.`
      );
    }
  }
}
```

Update line 206 to validate:

```typescript
if (cfg.setupCommand) {
  validateSetupCommand(cfg.setupCommand);
  await execDocker(["exec", "-i", name, "sh", "-lc", cfg.setupCommand]);
}
```

### Task 2: Add Command Audit Logging

**New file:** `src/security/command-audit-log.ts`

```typescript
import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";

export interface CommandAuditEvent {
  timestamp: number;
  sessionKey: string;
  userId?: string;
  command: string;
  sandbox: boolean;
  elevated: boolean;
  approved: boolean;
  exitCode?: number;
  duration?: number;
}

async function ensureLogDir(): Promise<string> {
  const logDir = path.join(resolveStateDir(), 'logs');
  await fs.mkdir(logDir, { recursive: true, mode: 0o700 });
  return logDir;
}

async function getLogPath(): Promise<string> {
  const logDir = await ensureLogDir();
  return path.join(logDir, 'command-audit.jsonl');
}

export async function logCommand(event: CommandAuditEvent): Promise<void> {
  try {
    const logPath = await getLogPath();
    const line = JSON.stringify(event) + '\n';
    await fs.appendFile(logPath, line, { mode: 0o600 });
  } catch (error) {
    console.error('Failed to log command:', error);
  }
}

export async function getRecentCommands(limit = 100): Promise<CommandAuditEvent[]> {
  try {
    const logPath = await getLogPath();
    const content = await fs.readFile(logPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    return lines.slice(-limit).map(line => JSON.parse(line));
  } catch {
    return [];
  }
}
```

### Task 3: Strengthen Forbidden Tokens

**File:** `src/infra/exec-approvals.ts`

Find FORBIDDEN_TOKENS around line 750 and expand:

```typescript
const FORBIDDEN_TOKENS = [
  '>', '<', '`', '$(', '${', '||', '&&', ';', '|&',
  '\n', '(', ')', '{', '}', '[', ']',
  // Shell builtins that can be dangerous
  'eval', 'exec', 'source', '.',
  // Redirection operators
  '<<', '>>', '2>', '&>', '<&', '>&',
  // Process substitution
  '<(', '>(',
  // Command substitution alternatives
  '`', '$(',
];
```

## Success Criteria

- [ ] Docker setup commands validated before execution
- [ ] Forbidden network tools blocked in setup commands
- [ ] Command audit log created and functional
- [ ] Forbidden tokens list expanded
- [ ] All validation tests pass

## Testing

```bash
pnpm test src/agents/sandbox/docker.test.ts
pnpm test src/security/command-audit-log.test.ts
pnpm test src/infra/exec-approvals.test.ts
```
