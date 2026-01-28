import chalk from "chalk";
import { loadConfig } from "../config/io.js";
import type { MoltbotConfig } from "../config/config.js";
import { generateSecureToken } from "../security/audit-fix.js";
import { initializeEncryption } from "../security/secrets-encryption.js";
import { enforceSecurePermissions } from "../security/permission-enforcer.js";

interface MigrationChange {
  category: string;
  description: string;
  applied: boolean;
  severity?: 'error' | 'warning' | 'info';
}

function checkForOpenDmPolicy(config: MoltbotConfig): boolean {
  // Check defaults
  const defaults = config.channels?.defaults as any;
  if (defaults?.dmPolicy === 'open') return true;
  
  // Check each channel
  for (const [key, value] of Object.entries(config.channels ?? {})) {
    if (key === 'defaults') continue;
    const channel = value as any;
    if (channel?.dm?.policy === 'open' || channel?.dmPolicy === 'open') {
      return true;
    }
  }
  
  return false;
}

export async function migrateToPhase1(options: { dryRun?: boolean } = {}): Promise<void> {
  console.log('');
  console.log(chalk.bold.cyan('═══════════════════════════════════════════════════════'));
  console.log(chalk.bold.cyan('  MOLTBOT PHASE 1 SECURITY MIGRATION'));
  console.log(chalk.bold.cyan('═══════════════════════════════════════════════════════'));
  console.log('');
  
  if (options.dryRun) {
    console.log(chalk.yellow('DRY RUN MODE - No changes will be written'));
    console.log('');
  }
  
  const changes: MigrationChange[] = [];
  let config: MoltbotConfig;
  
  try {
    config = loadConfig();
  } catch (error) {
    console.log(chalk.red('❌ Failed to load config'));
    console.log(chalk.dim(String(error)));
    return;
  }
  
  let configModified = false;
  
  // 1. Check sandbox mode
  const sandboxMode = config.agents?.defaults?.sandbox?.mode;
  if (!sandboxMode || sandboxMode === undefined) {
    changes.push({
      category: 'Sandbox',
      description: 'Will use new default: sandbox.mode="non-main" (previously "off")',
      applied: true,
      severity: 'info',
    });
  } else if (sandboxMode === 'off') {
    changes.push({
      category: 'Sandbox',
      description: 'WARNING: sandbox.mode="off" detected (insecure - consider changing to "non-main")',
      applied: false,
      severity: 'warning',
    });
  } else {
    changes.push({
      category: 'Sandbox',
      description: `Current mode: "${sandboxMode}" (secure)`,
      applied: false,
      severity: 'info',
    });
  }
  
  // 2. Check dmPolicy=open
  const hasDmPolicyOpen = checkForOpenDmPolicy(config);
  if (hasDmPolicyOpen) {
    changes.push({
      category: 'DM Policy',
      description: 'ERROR: dmPolicy="open" detected - THIS WILL BREAK. Change to "pairing" immediately.',
      applied: false,
      severity: 'error',
    });
  } else {
    changes.push({
      category: 'DM Policy',
      description: 'No dmPolicy="open" found (secure)',
      applied: false,
      severity: 'info',
    });
  }
  
  // 3. Check gateway auth
  const hasToken = Boolean(config.gateway?.auth?.token || process.env.CLAWDBOT_GATEWAY_TOKEN);
  const hasPassword = Boolean(config.gateway?.auth?.password || process.env.CLAWDBOT_GATEWAY_PASSWORD);
  
  if (!hasToken && !hasPassword) {
    changes.push({
      category: 'Gateway Auth',
      description: 'WARNING: No gateway auth configured. Generate token with: moltbot security audit --fix',
      applied: false,
      severity: 'warning',
    });
  } else {
    const token = config.gateway?.auth?.token || process.env.CLAWDBOT_GATEWAY_TOKEN || '';
    if (token && token.length < 32) {
      changes.push({
        category: 'Gateway Auth',
        description: `WARNING: Token is too short (${token.length} chars, need 32+)`,
        applied: false,
        severity: 'warning',
      });
    } else {
      changes.push({
        category: 'Gateway Auth',
        description: 'Gateway auth configured (secure)',
        applied: false,
        severity: 'info',
      });
    }
  }
  
  // 4. Check log redaction
  if (config.logging?.redactSensitive === 'off') {
    changes.push({
      category: 'Logging',
      description: 'WARNING: logging.redactSensitive="off" can leak secrets',
      applied: false,
      severity: 'warning',
    });
  } else {
    changes.push({
      category: 'Logging',
      description: 'Log redaction enabled (secure)',
      applied: false,
      severity: 'info',
    });
  }
  
  // 5. Initialize encryption
  if (!options.dryRun) {
    try {
      await initializeEncryption();
      changes.push({
        category: 'Encryption',
        description: 'Encryption system initialized (key generated if not exists)',
        applied: true,
        severity: 'info',
      });
    } catch (error) {
      changes.push({
        category: 'Encryption',
        description: `Failed to initialize: ${String(error)}`,
        applied: false,
        severity: 'error',
      });
    }
  } else {
    changes.push({
      category: 'Encryption',
      description: 'Would initialize encryption (skipped in dry-run)',
      applied: false,
      severity: 'info',
    });
  }
  
  // 6. Fix file permissions
  if (!options.dryRun) {
    try {
      const fixed = await enforceSecurePermissions();
      changes.push({
        category: 'Permissions',
        description: `Fixed permissions on ${fixed} paths (0o600/0o700)`,
        applied: true,
        severity: 'info',
      });
    } catch (error) {
      changes.push({
        category: 'Permissions',
        description: `Failed to fix: ${String(error)}`,
        applied: false,
        severity: 'error',
      });
    }
  } else {
    changes.push({
      category: 'Permissions',
      description: 'Would fix file permissions (skipped in dry-run)',
      applied: false,
      severity: 'info',
    });
  }
  
  // Display results
  console.log(chalk.bold('Migration Analysis:'));
  console.log('');
  
  const errors = changes.filter(c => c.severity === 'error');
  const warnings = changes.filter(c => c.severity === 'warning');
  const applied = changes.filter(c => c.applied);
  
  for (const change of changes) {
    const icon = change.applied 
      ? chalk.green('✓')
      : change.severity === 'error'
      ? chalk.red('✗')
      : change.severity === 'warning'
      ? chalk.yellow('⚠')
      : chalk.blue('ℹ');
    
    const category = chalk.bold(`[${change.category}]`);
    console.log(`  ${icon} ${category} ${change.description}`);
  }
  
  console.log('');
  
  if (errors.length > 0) {
    console.log(chalk.red.bold(`❌ ${errors.length} ERROR(s) - Must fix before using Phase 1`));
    console.log('');
  }
  
  if (warnings.length > 0) {
    console.log(chalk.yellow.bold(`⚠️  ${warnings.length} WARNING(s) - Should address`));
    console.log('');
  }
  
  if (applied.length > 0) {
    console.log(chalk.green.bold(`✓ Applied ${applied.length} fix${applied.length === 1 ? '' : 'es'}`));
    console.log('');
  }
  
  console.log(chalk.bold('Next Steps:'));
  console.log('  1. Review breaking changes: docs/security/breaking-changes-phase1.md');
  console.log('  2. Fix any ERRORs or WARNINGs above');
  console.log('  3. Run security audit: moltbot security audit --deep');
  console.log('  4. Test configuration: moltbot status --all');
  console.log('');
}
