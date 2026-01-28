---
plan_id: 08-migration-tools
phase: 1
wave: 3
autonomous: true
---

# Migration Tools and Breaking Changes Guide

## Goal

Create migration command to help users upgrade to Phase 1 security defaults and document all breaking changes.

## Tasks

### Task 1: Create Migration Command

**New file:** `src/commands/security-migrate.ts`

```typescript
import chalk from "chalk";
import { loadConfig, writeConfig } from "../config/io.js";
import type { MoltbotConfig } from "../config/config.js";
import { generateSecureToken } from "../security/audit-fix.js";
import { initializeEncryption, encryptSensitiveFields } from "../security/secrets-encryption.js";
import { enforceSecurePermissions } from "../security/permission-enforcer.js";

interface MigrationChange {
  category: string;
  description: string;
  applied: boolean;
}

export async function migrateToPhase1(options: { dryRun?: boolean } = {}): Promise<void> {
  console.log('');
  console.log(chalk.bold.cyan('═══════════════════════════════════════════════════════'));
  console.log(chalk.bold.cyan('  MOLTBOT PHASE 1 SECURITY MIGRATION'));
  console.log(chalk.bold.cyan('═══════════════════════════════════════════════════════'));
  console.log('');
  
  const changes: MigrationChange[] = [];
  const config = await loadConfig();
  let modified = false;
  
  // 1. Enable sandbox by default
  if (!config.agents?.defaults?.sandbox?.mode) {
    config.agents = config.agents || {};
    config.agents.defaults = config.agents.defaults || {};
    config.agents.defaults.sandbox = config.agents.defaults.sandbox || {};
    config.agents.defaults.sandbox.mode = 'non-main';
    changes.push({
      category: 'Sandbox',
      description: 'Enabled sandbox.mode="non-main" (previously "off")',
      applied: true,
    });
    modified = true;
  } else if (config.agents.defaults.sandbox.mode === 'off') {
    changes.push({
      category: 'Sandbox',
      description: 'WARNING: sandbox.mode="off" detected (insecure, please review)',
      applied: false,
    });
  }
  
  // 2. Check and warn about dmPolicy=open
  const hasDmPolicyOpen = checkForOpenDmPolicy(config);
  if (hasDmPolicyOpen) {
    changes.push({
      category: 'DM Policy',
      description: 'ERROR: dmPolicy="open" is no longer supported. Change to "pairing".',
      applied: false,
    });
  }
  
  // 3. Ensure gateway auth is configured
  if (!config.gateway?.auth?.token && !config.gateway?.auth?.password) {
    changes.push({
      category: 'Gateway Auth',
      description: 'WARNING: No gateway auth configured. Generate token with: moltbot security audit --fix',
      applied: false,
    });
  }
  
  // 4. Enable log redaction
  if (config.logging?.redactSensitive === 'off') {
    if (!config.logging) config.logging = {};
    config.logging.redactSensitive = 'tools';
    changes.push({
      category: 'Logging',
      description: 'Enabled logging.redactSensitive="tools" (was "off")',
      applied: true,
    });
    modified = true;
  }
  
  // 5. Initialize encryption
  await initializeEncryption();
  changes.push({
    category: 'Encryption',
    description: 'Initialized encryption system (keys generated)',
    applied: true,
  });
  
  // 6. Fix file permissions
  if (!options.dryRun) {
    const fixed = await enforceSecurePermissions();
    changes.push({
      category: 'Permissions',
      description: `Fixed permissions on ${fixed} paths (0o600/0o700)`,
      applied: true,
    });
  }
  
  // Display changes
  console.log(chalk.bold('Migration Changes:'));
  console.log('');
  
  for (const change of changes) {
    const icon = change.applied ? chalk.green('✓') : chalk.red('✗');
    const category = chalk.bold(`[${change.category}]`);
    console.log(`  ${icon} ${category} ${change.description}`);
  }
  
  console.log('');
  
  // Write config if modified and not dry run
  if (modified && !options.dryRun) {
    await writeConfig(config);
    console.log(chalk.green('✓ Configuration updated'));
  } else if (modified && options.dryRun) {
    console.log(chalk.yellow('ℹ️  Dry run - no changes written'));
  }
  
  console.log('');
  console.log(chalk.bold('Next Steps:'));
  console.log('  1. Review breaking changes: docs/security/breaking-changes-phase1.md');
  console.log('  2. Run security audit: moltbot security audit --deep');
  console.log('  3. Test your configuration: moltbot gateway --test');
  console.log('');
}

function checkForOpenDmPolicy(config: MoltbotConfig): boolean {
  if ((config.channels?.defaults as any)?.dmPolicy === 'open') return true;
  
  for (const [key, value] of Object.entries(config.channels ?? {})) {
    if (key === 'defaults') continue;
    const channel = value as any;
    if (channel?.dm?.policy === 'open' || channel?.dmPolicy === 'open') {
      return true;
    }
  }
  
  return false;
}
```

### Task 2: Register Migration Command

**File:** `src/cli/security-cli.ts`

Add migration command:

```typescript
import { migrateToPhase1 } from "../commands/security-migrate.js";

program
  .command('migrate')
  .description('Migrate to Phase 1 security defaults')
  .option('--dry-run', 'Show changes without applying them')
  .action(async (options) => {
    await migrateToPhase1(options);
  });
```

### Task 3: Create Breaking Changes Guide

**New file:** `docs/security/breaking-changes-phase1.md`

```markdown
---
title: "Phase 1 Security Hardening - Breaking Changes"
---

# Phase 1 Security Hardening - Breaking Changes

Phase 1 implements Pentagon-level security hardening with several breaking changes. This guide helps you migrate your existing configuration.

## Overview

Phase 1 focuses on secure-by-default configuration and removes insecure options that could expose your bot to unauthorized access.

---

## Breaking Changes

### 1. Gateway Authentication Now Required (CRITICAL)

**What changed:**
- Gateway authentication is now **required for all connections**, including loopback
- Minimum token length increased from 24 to **32 characters**
- Tokens must have at least 20 unique characters for sufficient entropy

**Migration:**

Generate a secure token:
```bash
moltbot security audit --fix
# Or manually:
openssl rand -base64 32
```

Update your config:
```json
{
  "gateway": {
    "auth": {
      "mode": "token",
      "token": "your-32-character-token-here-abcdefgh"
    }
  }
}
```

Or use environment variable:
```bash
export CLAWDBOT_GATEWAY_TOKEN="your-32-character-token-here-abcdefgh"
```

**Impact:**
- Existing short tokens will be rejected
- Connections without auth will fail
- You must update all clients (CLI, macOS app, mobile apps) with the new token

---

### 2. Sandbox Mode Default Changed to "non-main" (HIGH)

**What changed:**
- Default sandbox mode changed from `"off"` to `"non-main"`
- Non-main sessions (groups, channels) now run in Docker containers by default

**Migration:**

If you want to keep the old behavior (NOT recommended):
```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "off"
      }
    }
  }
}
```

Recommended - embrace the new default:
```bash
# Ensure Docker is installed and running
docker --version

# Pull sandbox image
docker pull debian:bookworm-slim
docker tag debian:bookworm-slim moltbot-sandbox:latest
```

**Impact:**
- Requires Docker installed and running
- First run of non-main sessions will be slower (container creation)
- Improved security isolation for group/channel messages

---

### 3. dmPolicy="open" Removed (CRITICAL)

**What changed:**
- The `dmPolicy="open"` option has been completely removed
- Attempting to use it will cause configuration validation to fail

**Migration:**

Replace all instances of `"open"` with `"pairing"`:

Before:
```json
{
  "channels": {
    "telegram": {
      "dm": {
        "policy": "open",
        "allowFrom": ["*"]
      }
    }
  }
}
```

After:
```json
{
  "channels": {
    "telegram": {
      "dm": {
        "policy": "pairing"
      }
    }
  }
}
```

**New pairing flow:**
1. User sends message to bot
2. Bot responds with pairing code
3. You approve: `moltbot pairing approve telegram <code>`
4. User can now interact with bot

**Impact:**
- Requires explicit approval for each new user
- More secure but less convenient for public bots
- If you need public access, this is not the right tool

---

### 4. Secrets Encrypted at Rest (HIGH)

**What changed:**
- All secrets in config files and auth profiles are now encrypted using AES-256-GCM
- Encryption key stored in `~/.moltbot/keys/secrets.key`

**Migration:**

Automatic - secrets are encrypted on first write:
```bash
# Initialize encryption
moltbot security migrate

# Existing plain-text secrets will be encrypted automatically
# on next config write
```

**Backup your existing config before migration:**
```bash
cp ~/.moltbot/moltbot.json ~/.moltbot/moltbot.json.backup
```

**Impact:**
- Config files will contain encrypted JSON objects instead of plain text
- Cannot manually edit encrypted secrets (use `moltbot config set` instead)
- Must backup encryption key for disaster recovery

---

### 5. File Permissions Enforced (HIGH)

**What changed:**
- Strict file permissions enforced on startup
- Directories: `0o700` (drwx------)
- Files: `0o600` (-rw-------)

**Migration:**

Automatic - permissions are fixed on gateway startup:
```bash
# Manual fix:
moltbot doctor

# Or:
chmod 700 ~/.moltbot ~/.moltbot/credentials ~/.moltbot/agents ~/.moltbot/keys
chmod 600 ~/.moltbot/moltbot.json ~/.moltbot/credentials/*
```

**Impact:**
- Other users on the system cannot read your config
- Shared hosting environments may need adjustments

---

### 6. Dangerous Flags Deprecated (CRITICAL)

**What changed:**
- `gateway.controlUi.allowInsecureAuth` marked as deprecated (will be removed in Phase 2)
- `gateway.controlUi.dangerouslyDisableDeviceAuth` marked as deprecated (will be removed in Phase 2)

**Migration:**

Remove these flags from your config:
```json
{
  "gateway": {
    "controlUi": {
      "allowInsecureAuth": false,  // Remove this line
      "dangerouslyDisableDeviceAuth": false  // Remove this line
    }
  }
}
```

Use proper auth instead:
- For remote access: Use Tailscale Serve
- For local access: Use localhost with token auth

**Impact:**
- Security audit will show CRITICAL warnings
- Flags will stop working in Phase 2

---

## Migration Checklist

- [ ] Backup your config: `cp ~/.moltbot/moltbot.json ~/.moltbot/moltbot.json.backup`
- [ ] Run migration: `moltbot security migrate`
- [ ] Generate strong gateway token (32+ chars)
- [ ] Update all clients with new token
- [ ] Remove `dmPolicy="open"` from config
- [ ] Set up pairing for authorized users
- [ ] Ensure Docker is installed (if using sandbox)
- [ ] Test gateway startup: `moltbot gateway --test`
- [ ] Run security audit: `moltbot security audit --deep`
- [ ] Verify score is 85+

---

## Rollback

If you need to rollback:

```bash
# Restore backup
cp ~/.moltbot/moltbot.json.backup ~/.moltbot/moltbot.json

# Downgrade to pre-Phase 1 version
npm install -g moltbot@<previous-version>

# Restart gateway
moltbot gateway restart
```

---

## Support

For issues during migration:
- GitHub Issues: https://github.com/moltbot/moltbot/issues
- Discord: https://discord.gg/clawd
- Security: steipete@gmail.com
```

### Task 4: Add Migration Entry Point

**File:** `src/commands/index.ts` or equivalent

Ensure `security-migrate.ts` is exported and registered.

## Success Criteria

- [ ] Migration command functional with dry-run option
- [ ] Breaking changes guide complete and comprehensive
- [ ] Migration checklist provided
- [ ] Rollback instructions documented
- [ ] Command registered in CLI

## Testing

```bash
# Dry run
pnpm moltbot security migrate --dry-run

# Actual migration
pnpm moltbot security migrate

# Verify
pnpm moltbot security audit --deep
```
