---
plan_id: 07-audit-enhancements
phase: 1
wave: 2
autonomous: true
---

# Security Audit Enhancements

## Goal

Add auto-fix mode and security scoring to the security audit command.

## Tasks

### Task 1: Add Security Score Functions

**File:** `src/security/audit.ts`

Add at end of file:

```typescript
export function calculateSecurityScore(report: SecurityAuditReport): number {
  let score = 100;
  
  // Deduct points based on severity
  score -= report.summary.critical * 20;
  score -= report.summary.warn * 5;
  score -= report.summary.info * 1;
  
  return Math.max(0, score);
}

export function getSecurityRating(score: number): string {
  if (score >= 90) return 'EXCELLENT';
  if (score >= 80) return 'GOOD';
  if (score >= 70) return 'ACCEPTABLE';
  if (score >= 50) return 'NEEDS IMPROVEMENT';
  return 'CRITICAL';
}

export type SecurityAuditReportWithScore = SecurityAuditReport & {
  score: number;
  rating: string;
};

export function addScoreToReport(report: SecurityAuditReport): SecurityAuditReportWithScore {
  const score = calculateSecurityScore(report);
  const rating = getSecurityRating(score);
  return { ...report, score, rating };
}
```

### Task 2: Create Auto-Fix Module

**New file:** `src/security/audit-fix.ts`

```typescript
import { randomBytes } from "node:crypto";
import type { SecurityAuditFinding } from "./audit.js";
import { enforceSecurePermissions } from "./permission-enforcer.js";
import type { MoltbotConfig } from "../config/config.js";

export interface FixResult {
  finding: SecurityAuditFinding;
  fixed: boolean;
  message?: string;
  error?: string;
}

export function isAutoFixable(finding: SecurityAuditFinding): boolean {
  const fixableIds = [
    'fs.state_dir.perms_world_writable',
    'fs.state_dir.perms_group_writable',
    'fs.state_dir.perms_readable',
    'fs.config.perms_writable',
    'fs.config.perms_world_readable',
    'fs.config.perms_group_readable',
    'gateway.token_too_short',
    'logging.redact_off',
  ];
  
  return fixableIds.includes(finding.checkId);
}

function generateSecureToken(length: number): string {
  const bytes = randomBytes(length);
  return bytes.toString('base64url').slice(0, length);
}

export async function applyFix(
  finding: SecurityAuditFinding,
  config: MoltbotConfig
): Promise<FixResult> {
  try {
    switch (finding.checkId) {
      case 'fs.state_dir.perms_world_writable':
      case 'fs.state_dir.perms_group_writable':
      case 'fs.state_dir.perms_readable':
      case 'fs.config.perms_writable':
      case 'fs.config.perms_world_readable':
      case 'fs.config.perms_group_readable': {
        const fixed = await enforceSecurePermissions();
        return {
          finding,
          fixed: true,
          message: `Fixed permissions on ${fixed} paths`,
        };
      }
      
      case 'gateway.token_too_short': {
        const newToken = generateSecureToken(32);
        return {
          finding,
          fixed: true,
          message: `Generated new token (save this): ${newToken}`,
        };
      }
      
      case 'logging.redact_off': {
        if (!config.logging) config.logging = {};
        config.logging.redactSensitive = 'tools';
        return {
          finding,
          fixed: true,
          message: 'Set logging.redactSensitive="tools"',
        };
      }
      
      default:
        return {
          finding,
          fixed: false,
          error: 'Not auto-fixable - requires manual intervention',
        };
    }
  } catch (error) {
    return {
      finding,
      fixed: false,
      error: String(error),
    };
  }
}
```

### Task 3: Update Security CLI Command

**File:** `src/cli/security-cli.ts`

Update the audit command handler to include score and fix mode:

```typescript
import { calculateSecurityScore, getSecurityRating, addScoreToReport } from "../security/audit.js";
import { isAutoFixable, applyFix, type FixResult } from "../security/audit-fix.js";
import chalk from "chalk";

// Update audit command
async function handleAudit(options: { deep?: boolean; fix?: boolean }): Promise<void> {
  const config = await loadConfig();
  const report = await runSecurityAudit({
    config,
    deep: options.deep === true,
    includeFilesystem: true,
    includeChannelSecurity: true,
  });
  
  const reportWithScore = addScoreToReport(report);
  
  // Display header
  console.log('');
  console.log(chalk.bold('╔══════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold('║         MOLTBOT SECURITY AUDIT REPORT                    ║'));
  console.log(chalk.bold('╚══════════════════════════════════════════════════════════╝'));
  console.log('');
  
  // Score display
  const scoreColor = reportWithScore.score >= 80 ? chalk.green : reportWithScore.score >= 50 ? chalk.yellow : chalk.red;
  console.log(chalk.bold('Security Score:'), scoreColor(`${reportWithScore.score}/100 (${reportWithScore.rating})`));
  console.log('');
  
  // Summary
  console.log(chalk.bold('Summary:'));
  if (report.summary.critical > 0) {
    console.log(chalk.red(`  ❌ ${report.summary.critical} CRITICAL issues (-${report.summary.critical * 20} points)`));
  }
  if (report.summary.warn > 0) {
    console.log(chalk.yellow(`  ⚠️  ${report.summary.warn} WARNING issues (-${report.summary.warn * 5} points)`));
  }
  if (report.summary.info > 0) {
    console.log(chalk.blue(`  ℹ️  ${report.summary.info} INFO issues (-${report.summary.info * 1} point${report.summary.info === 1 ? '' : 's'})`));
  }
  
  if (report.findings.length === 0) {
    console.log(chalk.green('  ✓ No security issues found'));
  }
  
  console.log('');
  console.log('─'.repeat(60));
  console.log('');
  
  // Display findings grouped by severity
  const bySeverity = {
    critical: report.findings.filter(f => f.severity === 'critical'),
    warn: report.findings.filter(f => f.severity === 'warn'),
    info: report.findings.filter(f => f.severity === 'info'),
  };
  
  for (const [severity, findings] of Object.entries(bySeverity)) {
    if (findings.length === 0) continue;
    
    const icon = severity === 'critical' ? '❌' : severity === 'warn' ? '⚠️' : 'ℹ️';
    const color = severity === 'critical' ? chalk.red : severity === 'warn' ? chalk.yellow : chalk.blue;
    const label = severity.toUpperCase();
    
    console.log(color.bold(`${icon} ${label} (${findings.length})`));
    console.log('');
    
    for (const finding of findings) {
      console.log(color(`  ${finding.title}`));
      console.log(`     ${finding.detail}`);
      
      if (finding.remediation) {
        console.log(chalk.dim(`     → ${finding.remediation}`));
      }
      
      if (options.fix && isAutoFixable(finding)) {
        console.log(chalk.cyan(`     🔧 Auto-fixable`));
      }
      
      console.log('');
    }
  }
  
  // Auto-fix mode
  if (options.fix) {
    console.log('─'.repeat(60));
    console.log('');
    
    const fixable = report.findings.filter(isAutoFixable);
    
    if (fixable.length === 0) {
      console.log(chalk.yellow('No auto-fixable issues found'));
      console.log('');
      return;
    }
    
    console.log(chalk.bold.cyan(`🔧 Applying ${fixable.length} auto-fix${fixable.length === 1 ? '' : 'es'}...`));
    console.log('');
    
    const results: FixResult[] = [];
    
    for (const finding of fixable) {
      const result = await applyFix(finding, config);
      results.push(result);
      
      if (result.fixed) {
        console.log(chalk.green(`  ✓ ${finding.title}`));
        if (result.message) {
          console.log(chalk.dim(`    ${result.message}`));
        }
      } else {
        console.log(chalk.red(`  ✗ ${finding.title}`));
        if (result.error) {
          console.log(chalk.dim(`    ${result.error}`));
        }
      }
    }
    
    console.log('');
    const fixed Count = results.filter(r => r.fixed).length;
    console.log(chalk.green.bold(`✓ Fixed ${fixedCount}/${fixable.length} issues`));
    console.log('');
  }
}
```

## Success Criteria

- [ ] Docker setup commands validated before execution
- [ ] Command audit logging implemented
- [ ] Forbidden tokens list expanded
- [ ] Security score and rating functions added
- [ ] Auto-fix mode functional
- [ ] Enhanced CLI output with visual improvements

## Testing

```bash
pnpm test src/security/audit.test.ts
pnpm test src/security/audit-fix.test.ts
pnpm moltbot security audit
pnpm moltbot security audit --fix
```
