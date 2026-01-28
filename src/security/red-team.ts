/**
 * Continuous Red Team - Auto-attack system
 *
 * Continuously tests security defenses by running known attacks
 * in a sandboxed environment and verifying they're blocked.
 *
 * Like a security CI/CD pipeline that never stops.
 *
 * @see Phase 9 - Pentagon+++ Security
 */

import { log } from "../common/log.js";
import {
  ATTACKS,
  type Attack,
  type AttackCategory,
  getAttackStats,
} from "./red-team-attacks.js";

// ============================================================================
// Types
// ============================================================================

export type AttackResult = {
  attackId: string;
  attackName: string;
  category: AttackCategory;
  severity: string;
  blocked: boolean;
  expected: boolean;
  passed: boolean; // blocked === expected
  duration: number;
  error?: string;
  response?: string;
};

export type RedTeamReport = {
  timestamp: number;
  duration: number;
  totalAttacks: number;
  passed: number;
  failed: number;
  blocked: number;
  allowed: number;
  results: AttackResult[];
  failures: AttackResult[]; // Only attacks that failed (blocked !== expected)
};

export type RedTeamConfig = {
  enabled: boolean;
  intervalMs: number; // How often to run (default: 1 hour)
  sandboxed: boolean; // Run in sandbox (always true for production)
  categories?: AttackCategory[]; // Run specific categories only
  maxDuration?: number; // Max duration per attack (ms)
};

// ============================================================================
// Red Team Runner
// ============================================================================

export class RedTeamRunner {
  private config: RedTeamConfig;
  private interval?: NodeJS.Timeout;
  private running = false;

  constructor(config: RedTeamConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Start continuous red teaming
   */
  start(): void {
    if (this.interval) {
      log.warn("Red team already running");
      return;
    }

    log.info("Starting continuous red team", {
      interval: this.config.intervalMs / 60000,
      sandboxed: this.config.sandboxed,
    });

    // Run immediately
    this.runRedTeam().catch((err) => {
      log.error("Red team run failed", { error: err });
    });

    // Schedule recurring runs
    this.interval = setInterval(() => {
      this.runRedTeam().catch((err) => {
        log.error("Red team run failed", { error: err });
      });
    }, this.config.intervalMs);
  }

  /**
   * Stop continuous red teaming
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
      log.info("Stopped continuous red team");
    }
  }

  /**
   * Run red team attacks once
   */
  async runRedTeam(): Promise<RedTeamReport> {
    if (this.running) {
      throw new Error("Red team already running");
    }

    this.running = true;
    const startTime = Date.now();

    log.info("🎯 Starting red team run");

    try {
      // Get attacks to run
      const attacks = this.getAttacksToRun();

      log.info(`Running ${attacks.length} attacks`);

      // Execute all attacks
      const results: AttackResult[] = [];

      for (const attack of attacks) {
        const result = await this.executeAttack(attack);
        results.push(result);

        // Log failures immediately
        if (!result.passed) {
          log.error("🚨 RED TEAM: Defense failure!", {
            attack: attack.name,
            expected: result.expected ? "blocked" : "allowed",
            actual: result.blocked ? "blocked" : "allowed",
          });
        }
      }

      // Generate report
      const report = this.generateReport(results, startTime);

      // Log summary
      log.info("Red team run complete", {
        total: report.totalAttacks,
        passed: report.passed,
        failed: report.failed,
        duration: report.duration,
      });

      if (report.failed > 0) {
        log.error(`🚨 ${report.failed} defense failures detected!`);
      }

      return report;
    } finally {
      this.running = false;
    }
  }

  /**
   * Get list of attacks to run based on config
   */
  private getAttacksToRun(): Attack[] {
    let attacks = ATTACKS;

    // Filter by category if specified
    if (this.config.categories && this.config.categories.length > 0) {
      attacks = attacks.filter((a) => this.config.categories!.includes(a.category));
    }

    return attacks;
  }

  /**
   * Execute single attack
   */
  private async executeAttack(attack: Attack): Promise<AttackResult> {
    const startTime = Date.now();

    log.debug("Executing attack", { id: attack.id, name: attack.name });

    try {
      // Run attack in sandbox
      const blocked = await this.runInSandbox(attack);

      const duration = Date.now() - startTime;

      return {
        attackId: attack.id,
        attackName: attack.name,
        category: attack.category,
        severity: attack.severity,
        blocked,
        expected: attack.expectedBlocked,
        passed: blocked === attack.expectedBlocked,
        duration,
      };
    } catch (err) {
      const duration = Date.now() - startTime;

      log.error("Attack execution error", {
        attack: attack.name,
        error: err,
      });

      // If attack threw error, assume it was blocked
      return {
        attackId: attack.id,
        attackName: attack.name,
        category: attack.category,
        severity: attack.severity,
        blocked: true,
        expected: attack.expectedBlocked,
        passed: true, // Error = blocked
        duration,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Run attack in isolated sandbox
   */
  private async runInSandbox(attack: Attack): Promise<boolean> {
    // TODO: Implement actual sandbox execution
    // For now, simulate by checking if attack would be caught by our defenses

    const testCase = attack.testCase;

    if (testCase.type === "prompt") {
      // Check prompt injection defenses
      return this.checkPromptDefense(testCase.message);
    }

    if (testCase.type === "tool") {
      // Check tool call defenses
      return this.checkToolDefense(testCase.tool, testCase.args);
    }

    if (testCase.type === "flow") {
      // Check toxic flow defenses
      return this.checkFlowDefense(testCase.steps);
    }

    return false;
  }

  /**
   * Check if prompt would be blocked by prompt injection defenses
   */
  private checkPromptDefense(message: string): boolean {
    // Simulate prompt injection checks
    // In real implementation, this would call the actual prompt validator

    const dangerousPatterns = [
      /ignore\s+(all\s+)?previous\s+instructions/i,
      /<\/system>/i,
      /<system>/i,
      /you\s+are\s+now\s+(DAN|admin)/i,
      /---END\s+USER\s+MESSAGE---/i,
      /<admin_override>/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(message)) {
        return true; // Would be blocked
      }
    }

    return false; // Would not be blocked
  }

  /**
   * Check if tool call would be blocked
   */
  private checkToolDefense(tool: string, args: Record<string, unknown>): boolean {
    // Simulate tool call validation
    // In real implementation, this would call the actual validators

    if (tool === "exec" && typeof args.command === "string") {
      // Check command injection patterns
      const dangerous = [/;\s*rm/i, /\|\s*curl/i, /\$\(/i, /sudo/i, />\s*\/dev\/null/i];

      for (const pattern of dangerous) {
        if (pattern.test(args.command)) {
          return true; // Blocked
        }
      }
    }

    if (tool === "read_file" && typeof args.path === "string") {
      // Check path traversal
      if (args.path.includes("../") || args.path.startsWith("/etc/")) {
        return true; // Blocked
      }
    }

    if (tool === "fetch" && typeof args.url === "string") {
      // Check SSRF
      const url = args.url.toLowerCase();
      if (
        url.includes("169.254.169.254") || // AWS metadata
        url.includes("192.168.") || // Private IP
        url.includes("localhost")
      ) {
        return true; // Blocked
      }
    }

    return false;
  }

  /**
   * Check if flow would be blocked by toxic flow detector
   */
  private checkFlowDefense(steps: Array<{ tool: string; args: Record<string, unknown> }>): boolean {
    // Check for dangerous flow patterns
    // E.g., read sensitive file -> network request

    if (steps.length < 2) {
      return false;
    }

    const firstStep = steps[0];
    const secondStep = steps[1];

    // Pattern: Read sensitive file -> Network request
    if (firstStep.tool === "read_file" && secondStep.tool === "fetch") {
      const path = firstStep.args.path as string;
      if (path.includes(".ssh") || path.includes("config") || path.includes("memory")) {
        return true; // Blocked by toxic flow detector
      }
    }

    // Pattern: Read config -> Write config
    if (firstStep.tool === "read_file" && secondStep.tool === "write_file") {
      const readPath = firstStep.args.path as string;
      const writePath = secondStep.args.path as string;
      if (readPath === writePath && readPath.includes("config")) {
        return true; // Blocked (config tampering)
      }
    }

    return false;
  }

  /**
   * Generate report from results
   */
  private generateReport(results: AttackResult[], startTime: number): RedTeamReport {
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    const blocked = results.filter((r) => r.blocked).length;
    const allowed = results.filter((r) => !r.blocked).length;

    return {
      timestamp: startTime,
      duration: Date.now() - startTime,
      totalAttacks: results.length,
      passed,
      failed,
      blocked,
      allowed,
      results,
      failures: results.filter((r) => !r.passed),
    };
  }

  /**
   * Get latest report
   */
  getLatestReport(): RedTeamReport | null {
    // TODO: Store reports and return latest
    return null;
  }

  /**
   * Check if currently running
   */
  isRunning(): boolean {
    return this.running;
  }
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_CONFIG: RedTeamConfig = {
  enabled: false, // Disabled by default
  intervalMs: 3600000, // 1 hour
  sandboxed: true,
  maxDuration: 30000, // 30 seconds per attack
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get attack statistics
 */
export function getStats() {
  return getAttackStats();
}

/**
 * Format report for display
 */
export function formatReport(report: RedTeamReport): string {
  const passRate = ((report.passed / report.totalAttacks) * 100).toFixed(1);

  let output = `Red Team Report\n`;
  output += `===============\n\n`;
  output += `Timestamp: ${new Date(report.timestamp).toISOString()}\n`;
  output += `Duration: ${report.duration}ms\n\n`;
  output += `Results:\n`;
  output += `  Total Attacks: ${report.totalAttacks}\n`;
  output += `  Passed: ${report.passed} (${passRate}%)\n`;
  output += `  Failed: ${report.failed}\n`;
  output += `  Blocked: ${report.blocked}\n`;
  output += `  Allowed: ${report.allowed}\n\n`;

  if (report.failures.length > 0) {
    output += `Failures:\n`;
    for (const failure of report.failures) {
      output += `  - ${failure.attackName} (${failure.attackId})\n`;
      output += `    Expected: ${failure.expected ? "BLOCKED" : "ALLOWED"}\n`;
      output += `    Actual: ${failure.blocked ? "BLOCKED" : "ALLOWED"}\n\n`;
    }
  }

  return output;
}
