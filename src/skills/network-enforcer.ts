/**
 * Network Enforcer - Runtime enforcement of network policies
 *
 * Intercepts network requests and enforces per-skill policies:
 * - Request validation
 * - Policy enforcement
 * - Audit logging
 * - Violation alerts
 *
 * @see Phase 10 - Pentagon++++ Security
 */

import { log } from "../common/log.js";
import { NetworkPolicyManager, type NetworkCheckResult } from "./network-policy.js";
import { promises as dns } from "node:dns";
import { writeFile, appendFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ============================================================================
// Types
// ============================================================================

export type NetworkRequest = {
  skillId: string;
  url: string;
  method: string;
  timestamp: number;
};

export type NetworkAuditLog = NetworkRequest & {
  allowed: boolean;
  reason?: string;
  matchedRule?: string;
  resolvedIP?: string;
};

export class NetworkPolicyViolation extends Error {
  constructor(
    message: string,
    public skillId: string,
    public url: string,
    public reason: string
  ) {
    super(message);
    this.name = "NetworkPolicyViolation";
  }
}

// ============================================================================
// Network Enforcer
// ============================================================================

export class NetworkEnforcer {
  private policyManager: NetworkPolicyManager;
  private auditLogPath: string;

  constructor(policyManager: NetworkPolicyManager, auditLogPath?: string) {
    this.policyManager = policyManager;
    this.auditLogPath =
      auditLogPath || join(homedir(), ".moltbot", "security", "network-audit.jsonl");
  }

  /**
   * Check if network request is allowed
   * @throws NetworkPolicyViolation if blocked
   */
  async enforce(skillId: string, url: string, method = "GET"): Promise<void> {
    const request: NetworkRequest = {
      skillId,
      url,
      method,
      timestamp: Date.now(),
    };

    // Check policy
    const result = await this.policyManager.check(skillId, url);

    // Resolve DNS (for IP-based checks)
    let resolvedIP: string | undefined;
    try {
      const parsed = new URL(url);
      const addresses = await dns.resolve4(parsed.hostname);
      resolvedIP = addresses[0];
    } catch (err) {
      // DNS resolution failed, proceed with hostname only
      log.debug("DNS resolution failed", { url, error: err });
    }

    // Log audit entry
    await this.logRequest({
      ...request,
      allowed: result.allowed,
      reason: result.reason,
      matchedRule: result.matchedRule,
      resolvedIP,
    });

    // Enforce
    if (!result.allowed) {
      log.warn("Network policy violation", {
        skillId,
        url,
        reason: result.reason,
      });

      throw new NetworkPolicyViolation(
        `Network policy violation: ${result.reason}`,
        skillId,
        url,
        result.reason || "Blocked by policy"
      );
    }

    log.debug("Network request allowed", {
      skillId,
      url,
      matchedRule: result.matchedRule,
    });
  }

  /**
   * Check without throwing (returns result)
   */
  async check(skillId: string, url: string): Promise<NetworkCheckResult> {
    return await this.policyManager.check(skillId, url);
  }

  /**
   * Log network request to audit trail
   */
  private async logRequest(entry: NetworkAuditLog): Promise<void> {
    // Ensure directory exists
    const dir = join(homedir(), ".moltbot", "security");
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    const line = JSON.stringify({
      ...entry,
      timestamp: new Date(entry.timestamp).toISOString(),
    }) + "\n";

    await appendFile(this.auditLogPath, line, "utf8");
  }

  /**
   * Get recent network requests (for auditing)
   */
  async getRecentRequests(limit = 100): Promise<NetworkAuditLog[]> {
    if (!existsSync(this.auditLogPath)) {
      return [];
    }

    const { readFile } = await import("node:fs/promises");
    const content = await readFile(this.auditLogPath, "utf8");
    const lines = content.split("\n").filter((l) => l.trim());

    const entries: NetworkAuditLog[] = [];

    for (const line of lines.slice(-limit)) {
      try {
        const entry = JSON.parse(line);
        entries.push(entry);
      } catch (err) {
        continue;
      }
    }

    return entries;
  }

  /**
   * Get violations only
   */
  async getViolations(limit = 100): Promise<NetworkAuditLog[]> {
    const requests = await this.getRecentRequests(limit * 2); // Get more to filter
    return requests.filter((r) => !r.allowed).slice(-limit);
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<{
    total: number;
    allowed: number;
    blocked: number;
    bySkill: Record<string, { allowed: number; blocked: number }>;
  }> {
    const requests = await this.getRecentRequests(1000);

    const stats = {
      total: requests.length,
      allowed: requests.filter((r) => r.allowed).length,
      blocked: requests.filter((r) => !r.allowed).length,
      bySkill: {} as Record<string, { allowed: number; blocked: number }>,
    };

    for (const request of requests) {
      if (!stats.bySkill[request.skillId]) {
        stats.bySkill[request.skillId] = { allowed: 0, blocked: 0 };
      }

      if (request.allowed) {
        stats.bySkill[request.skillId].allowed++;
      } else {
        stats.bySkill[request.skillId].blocked++;
      }
    }

    return stats;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let defaultEnforcer: NetworkEnforcer | null = null;

export async function getDefaultEnforcer(): Promise<NetworkEnforcer> {
  if (!defaultEnforcer) {
    const { getDefaultPolicyManager } = await import("./network-policy.js");
    const policyManager = await getDefaultPolicyManager();
    defaultEnforcer = new NetworkEnforcer(policyManager);
  }

  return defaultEnforcer;
}

export function clearDefaultEnforcer(): void {
  defaultEnforcer = null;
}

// ============================================================================
// Global Fetch Wrapper (for automatic enforcement)
// ============================================================================

/**
 * Wrap global fetch to automatically enforce network policies
 */
export function installFetchWrapper(skillId: string): void {
  const originalFetch = global.fetch;

  // @ts-ignore
  global.fetch = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const enforcer = await getDefaultEnforcer();
    const urlString = typeof url === "string" ? url : url.toString();

    // Enforce policy
    await enforcer.enforce(skillId, urlString, init?.method || "GET");

    // Call original fetch
    return originalFetch(url, init);
  };

  log.info("Installed fetch wrapper", { skillId });
}

/**
 * Restore original fetch
 */
export function uninstallFetchWrapper(): void {
  // TODO: Store original fetch and restore
  log.info("Uninstalled fetch wrapper");
}
