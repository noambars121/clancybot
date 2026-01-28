---
plan_id: 04-dm-policy
phase: 1
wave: 1
autonomous: true
---

# DM Policy Hardening

## Goal

Remove the `dmPolicy="open"` option and enforce pairing-only DM access with explicit user acknowledgment.

## Context

The `dmPolicy="open"` option allows anyone to DM the bot, which is a CRITICAL security risk. We need to:
1. Remove "open" from the schema enum
2. Add validation that rejects it
3. Enforce "pairing" as default
4. Add wildcard warning
5. Require acknowledgment for pairing

## Tasks

### Task 1: Remove "open" from Schema

**File:** `src/config/zod-schema.ts`

Find the DM policy schema definition and update it. Search for `dmPolicy` schemas and update all occurrences:

```typescript
// Update DM policy enum to remove 'open'
const dmPolicySchema = z.enum(['pairing', 'allowlist', 'disabled']);
```

If there are multiple channel-specific schemas, update them all.

### Task 2: Add Migration Validation

**File:** `src/config/validation.ts`

Add validation function (create file if it doesn't exist):

```typescript
import type { MoltbotConfig } from "./config.js";

export class ConfigValidationError extends Error {
  constructor(message: string, public readonly path: string) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

export function validateDmPolicy(policy: unknown, path: string): void {
  if (policy === 'open') {
    throw new ConfigValidationError(
      `dmPolicy="open" is no longer supported for security reasons. ` +
      `This option allowed anyone to DM your bot, which is a critical security risk. ` +
      `Please use "pairing" (recommended) or "allowlist" instead. ` +
      `Migration guide: docs/security/breaking-changes-phase1.md`,
      path
    );
  }
}

export function validateChannelConfig(config: MoltbotConfig): void {
  // Check channels.defaults
  if (config.channels?.defaults?.dmPolicy) {
    validateDmPolicy(config.channels.defaults.dmPolicy, 'channels.defaults.dmPolicy');
  }

  // Check each channel
  for (const [channelId, channelConfig] of Object.entries(config.channels ?? {})) {
    if (channelId === 'defaults') continue;
    
    const dmPolicy = (channelConfig as any)?.dm?.policy ?? (channelConfig as any)?.dmPolicy;
    if (dmPolicy) {
      validateDmPolicy(dmPolicy, `channels.${channelId}.dm.policy`);
    }
  }
}
```

**File:** `src/config/io.ts`

Add validation call after config parsing (around line 150-200 where config is loaded):

```typescript
import { validateChannelConfig } from "./validation.js";

// After loading and parsing config, before returning:
try {
  validateChannelConfig(config);
} catch (error) {
  if (error instanceof ConfigValidationError) {
    throw new Error(
      `Configuration validation failed at ${error.path}: ${error.message}`
    );
  }
  throw error;
}
```

### Task 3: Update Default Channel Config

**File:** `src/config/defaults.ts`

Add channel defaults constant:

```typescript
export const DEFAULT_CHANNEL_CONFIG = {
  dmPolicy: 'pairing' as const,
  groupPolicy: 'allowlist' as const,
};
```

### Task 4: Enhance Wildcard Warning in Audit

**File:** `src/security/audit.ts`

Update the wildcard check in `collectChannelSecurityFindings()` (around line 426-444):

```typescript
const normalized = normalizeAllowFromList(input.allowFrom);
const hasWildcard = normalized.includes('*');

if (hasWildcard) {
  findings.push({
    checkId: `channels.${input.provider}.allowlist.wildcard`,
    severity: 'critical',
    title: `${input.label} allowlist contains wildcard (*)`,
    detail:
      `Wildcard (*) in allowlist effectively makes your bot public on ${input.label}. ` +
      `Anyone on this channel can access your bot without approval. ` +
      `This is equivalent to dmPolicy="open" which has been removed for security.`,
    remediation:
      `Remove "*" from the allowlist immediately. Use explicit user IDs/usernames only. ` +
      `For new users, use the pairing flow: moltbot pairing approve ${input.provider} <code>`,
  });
}
```

### Task 5: Add Pairing Acknowledgment

**New file:** `src/pairing/pairing-acknowledgment.ts`

```typescript
import chalk from "chalk";
import { confirm } from "@clack/prompts";

export interface PairingContext {
  channelId: string;
  userId: string;
  username?: string;
  pairingCode: string;
}

export async function requirePairingAcknowledgment(
  context: PairingContext
): Promise<boolean> {
  console.log('');
  console.log(chalk.yellow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.yellow('⚠️  SECURITY WARNING: Pairing Request'));
  console.log(chalk.yellow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log('');
  console.log('You are about to approve a new user to access your bot.');
  console.log('');
  console.log(chalk.bold('Channel:'), context.channelId);
  console.log(chalk.bold('User ID:'), context.userId);
  if (context.username) {
    console.log(chalk.bold('Username:'), context.username);
  }
  console.log(chalk.bold('Pairing Code:'), context.pairingCode);
  console.log('');
  console.log(chalk.red('⚠️  This user will be able to:'));
  console.log('  • Execute commands on your system');
  console.log('  • Access files in agent workspace');
  console.log('  • View bot responses and data');
  console.log('  • Invoke tools and integrations');
  console.log('');
  console.log(chalk.yellow('Only approve users you trust completely.'));
  console.log('');

  const confirmed = await confirm({
    message: 'Do you trust this user and want to grant access?',
    initialValue: false,
  });

  if (confirmed) {
    console.log('');
    console.log(chalk.green('✓ User approved and added to allowlist'));
    console.log('');
    console.log(chalk.dim('Tip: Review approved users with:'));
    console.log(chalk.dim('  moltbot pairing list'));
    console.log('');
  } else {
    console.log('');
    console.log(chalk.red('✗ Pairing request rejected'));
    console.log('');
  }

  return confirmed === true;
}

export async function requirePairingAcknowledgmentSimple(
  channelId: string,
  userId: string
): Promise<boolean> {
  return requirePairingAcknowledgment({
    channelId,
    userId,
    pairingCode: 'N/A',
  });
}
```

**File:** `src/cli/pairing-cli.ts`

Update the approve command to use acknowledgment (find the approve command handler):

```typescript
import { requirePairingAcknowledgment } from "../pairing/pairing-acknowledgment.js";

// In the approve command handler:
const acknowledged = await requirePairingAcknowledgment({
  channelId: channel,
  userId: code, // or actual user ID if available
  pairingCode: code,
});

if (!acknowledged) {
  console.log('Pairing cancelled by user');
  return;
}

// Proceed with approval...
```

## Success Criteria

- [ ] "open" removed from all DM policy schemas
- [ ] Config validation rejects dmPolicy="open" with clear error
- [ ] Default channel config sets dmPolicy="pairing"
- [ ] Security audit shows CRITICAL for wildcard in allowlist
- [ ] Pairing acknowledgment requires explicit user confirmation
- [ ] Breaking change documented in error messages

## Testing

```bash
# Test schema validation
pnpm test src/config/zod-schema.test.ts

# Test config validation
pnpm test src/config/validation.test.ts

# Test pairing acknowledgment
pnpm test src/pairing/pairing-acknowledgment.test.ts

# Manual test - should fail
echo '{"channels":{"telegram":{"dm":{"policy":"open"}}}}' > test-config.json
pnpm moltbot config --file test-config.json validate
```
