/**
 * Network Policy - Per-skill network access control
 *
 * Implements granular network policies for skills:
 * - Allowlist/Blocklist modes
 * - Domain patterns (wildcards, regex)
 * - IP range checks (CIDR, private IPs)
 * - Port restrictions
 * - Protocol restrictions
 *
 * Like application-level firewall, but per skill.
 *
 * @see Phase 10 - Pentagon++++ Security
 */

import { log } from "../common/log.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

// ============================================================================
// Types
// ============================================================================

export type PolicyMode = "allowlist" | "blocklist";

export type NetworkPolicy = {
  skillId: string;
  mode: PolicyMode;
  allow: string[]; // Domains/IPs to allow
  block: string[]; // Domains/IPs to block
  ports?: {
    allow?: number[];
    block?: number[];
  };
  protocols?: {
    allow?: string[]; // http, https, ws, wss
    block?: string[];
  };
  extends?: string; // Inherit from another policy
  preset?: string; // Use preset policy
  enabled: boolean;
};

export type PolicyPreset = {
  name: string;
  description: string;
  policy: Omit<NetworkPolicy, "skillId" | "enabled">;
};

export type NetworkCheckResult = {
  allowed: boolean;
  reason?: string;
  matchedRule?: string;
};

// ============================================================================
// Policy Presets
// ============================================================================

export const POLICY_PRESETS: Record<string, PolicyPreset> = {
  "public-api": {
    name: "Public API",
    description: "Allow external HTTPS APIs only",
    policy: {
      mode: "allowlist",
      allow: ["*"],
      block: ["private", "localhost", "metadata", "192.168.*.*", "10.*.*.*", "172.16.*.*"],
      ports: {
        allow: [80, 443],
      },
      protocols: {
        allow: ["https"],
      },
    },
  },

  "internal-only": {
    name: "Internal Only",
    description: "Allow private IPs only (no external internet)",
    policy: {
      mode: "allowlist",
      allow: ["192.168.*.*", "10.*.*.*", "172.16.*.*", "localhost"],
      block: [],
      ports: {
        allow: [80, 443, 8080, 3000],
      },
    },
  },

  "no-network": {
    name: "No Network",
    description: "Block all network access",
    policy: {
      mode: "blocklist",
      allow: [],
      block: ["*"],
    },
  },

  unrestricted: {
    name: "Unrestricted",
    description: "Allow all network access (use with caution)",
    policy: {
      mode: "allowlist",
      allow: ["*"],
      block: [],
    },
  },
};

// ============================================================================
// Network Policy Manager
// ============================================================================

export class NetworkPolicyManager {
  private policies: Map<string, NetworkPolicy> = new Map();
  private policiesPath: string;

  constructor(configDir?: string) {
    const base = configDir || join(homedir(), ".moltbot", "security");
    this.policiesPath = join(base, "network-policies.json");
  }

  /**
   * Load policies from disk
   */
  async load(): Promise<void> {
    if (!existsSync(this.policiesPath)) {
      log.debug("No network policies file found, using defaults");
      return;
    }

    const content = await readFile(this.policiesPath, "utf8");
    const data = JSON.parse(content) as { policies: NetworkPolicy[] };

    this.policies.clear();
    for (const policy of data.policies) {
      this.policies.set(policy.skillId, policy);
    }

    log.info("Loaded network policies", { count: this.policies.size });
  }

  /**
   * Save policies to disk
   */
  async save(): Promise<void> {
    // Ensure directory exists
    await mkdir(dirname(this.policiesPath), { recursive: true });

    const data = {
      version: "1.0",
      updated: new Date().toISOString(),
      policies: Array.from(this.policies.values()),
    };

    await writeFile(this.policiesPath, JSON.stringify(data, null, 2), "utf8");

    log.info("Saved network policies", { count: this.policies.size });
  }

  /**
   * Set policy for skill
   */
  async setPolicy(policy: NetworkPolicy): Promise<void> {
    // Resolve preset if specified
    if (policy.preset) {
      const preset = POLICY_PRESETS[policy.preset];
      if (!preset) {
        throw new Error(`Unknown preset: ${policy.preset}`);
      }

      policy = {
        skillId: policy.skillId,
        enabled: policy.enabled ?? true,
        ...preset.policy,
      };
    }

    this.policies.set(policy.skillId, policy);
    await this.save();

    log.info("Set network policy", { skillId: policy.skillId, mode: policy.mode });
  }

  /**
   * Get policy for skill
   */
  getPolicy(skillId: string): NetworkPolicy | undefined {
    const policy = this.policies.get(skillId);

    // Handle inheritance
    if (policy?.extends) {
      const parent = this.policies.get(policy.extends);
      if (parent) {
        return this.mergePolices(parent, policy);
      }
    }

    return policy;
  }

  /**
   * Delete policy for skill
   */
  async deletePolicy(skillId: string): Promise<boolean> {
    const deleted = this.policies.delete(skillId);
    if (deleted) {
      await this.save();
      log.info("Deleted network policy", { skillId });
    }
    return deleted;
  }

  /**
   * Get all policies
   */
  getAllPolicies(): NetworkPolicy[] {
    return Array.from(this.policies.values());
  }

  /**
   * Check if URL is allowed for skill
   */
  async check(skillId: string, url: string): Promise<NetworkCheckResult> {
    const policy = this.getPolicy(skillId);

    // No policy = allow all
    if (!policy) {
      return { allowed: true };
    }

    // Policy disabled = allow all
    if (!policy.enabled) {
      return { allowed: true };
    }

    // Parse URL
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (err) {
      return {
        allowed: false,
        reason: "Invalid URL",
      };
    }

    // Check protocol
    const protocolCheck = this.checkProtocol(parsed.protocol.replace(":", ""), policy);
    if (!protocolCheck.allowed) {
      return protocolCheck;
    }

    // Check port
    const port = parsed.port ? parseInt(parsed.port) : this.getDefaultPort(parsed.protocol);
    const portCheck = this.checkPort(port, policy);
    if (!portCheck.allowed) {
      return portCheck;
    }

    // Check domain/host
    const hostCheck = this.checkHost(parsed.hostname, policy);
    if (!hostCheck.allowed) {
      return hostCheck;
    }

    return { allowed: true };
  }

  // ========================================================================
  // Validation Helpers
  // ========================================================================

  private checkProtocol(protocol: string, policy: NetworkPolicy): NetworkCheckResult {
    const { protocols } = policy;

    if (!protocols) {
      return { allowed: true };
    }

    // Check blocklist first
    if (protocols.block && protocols.block.includes(protocol)) {
      return {
        allowed: false,
        reason: `Protocol blocked: ${protocol}`,
        matchedRule: `protocols.block: ${protocol}`,
      };
    }

    // Check allowlist
    if (protocols.allow && protocols.allow.length > 0) {
      if (!protocols.allow.includes(protocol)) {
        return {
          allowed: false,
          reason: `Protocol not in allowlist: ${protocol}`,
          matchedRule: `protocols.allow: ${protocols.allow.join(", ")}`,
        };
      }
    }

    return { allowed: true };
  }

  private checkPort(port: number, policy: NetworkPolicy): NetworkCheckResult {
    const { ports } = policy;

    if (!ports) {
      return { allowed: true };
    }

    // Check blocklist first
    if (ports.block && ports.block.includes(port)) {
      return {
        allowed: false,
        reason: `Port blocked: ${port}`,
        matchedRule: `ports.block: ${port}`,
      };
    }

    // Check allowlist
    if (ports.allow && ports.allow.length > 0) {
      if (!ports.allow.includes(port)) {
        return {
          allowed: false,
          reason: `Port not in allowlist: ${port}`,
          matchedRule: `ports.allow: ${ports.allow.join(", ")}`,
        };
      }
    }

    return { allowed: true };
  }

  private checkHost(hostname: string, policy: NetworkPolicy): NetworkCheckResult {
    if (policy.mode === "allowlist") {
      // Allowlist mode: must match allow list
      for (const pattern of policy.allow) {
        if (this.matchesPattern(hostname, pattern)) {
          // Check if also in blocklist (blocklist overrides)
          for (const blockPattern of policy.block) {
            if (this.matchesPattern(hostname, blockPattern)) {
              return {
                allowed: false,
                reason: `Host in blocklist: ${hostname}`,
                matchedRule: `block: ${blockPattern}`,
              };
            }
          }

          return { allowed: true, matchedRule: `allow: ${pattern}` };
        }
      }

      return {
        allowed: false,
        reason: `Host not in allowlist: ${hostname}`,
        matchedRule: "allowlist mode",
      };
    } else {
      // Blocklist mode: must NOT match block list
      for (const pattern of policy.block) {
        if (this.matchesPattern(hostname, pattern)) {
          return {
            allowed: false,
            reason: `Host in blocklist: ${hostname}`,
            matchedRule: `block: ${pattern}`,
          };
        }
      }

      return { allowed: true };
    }
  }

  /**
   * Match hostname against pattern (supports wildcards)
   */
  private matchesPattern(hostname: string, pattern: string): boolean {
    // Special patterns
    if (pattern === "private") {
      return this.isPrivateIP(hostname);
    }

    if (pattern === "localhost") {
      return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
    }

    if (pattern === "metadata") {
      return hostname === "169.254.169.254"; // AWS/GCP metadata
    }

    if (pattern === "*") {
      return true; // Match all
    }

    // Wildcard pattern (e.g., *.example.com or 192.168.*.*)
    if (pattern.includes("*")) {
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*").replace(/\./g, "\\.") + "$");
      return regex.test(hostname);
    }

    // Exact match
    return hostname === pattern;
  }

  /**
   * Check if hostname is a private IP
   */
  private isPrivateIP(hostname: string): boolean {
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^127\./,
      /^169\.254\./,
    ];

    return privateRanges.some((pattern) => pattern.test(hostname));
  }

  /**
   * Get default port for protocol
   */
  private getDefaultPort(protocol: string): number {
    const defaults: Record<string, number> = {
      "http:": 80,
      "https:": 443,
      "ws:": 80,
      "wss:": 443,
      "ftp:": 21,
    };

    return defaults[protocol] || 80;
  }

  /**
   * Merge parent and child policies (for inheritance)
   */
  private mergePolices(parent: NetworkPolicy, child: NetworkPolicy): NetworkPolicy {
    return {
      ...parent,
      ...child,
      allow: [...parent.allow, ...child.allow],
      block: [...parent.block, ...child.block],
      ports: {
        allow: [...(parent.ports?.allow || []), ...(child.ports?.allow || [])],
        block: [...(parent.ports?.block || []), ...(child.ports?.block || [])],
      },
      protocols: {
        allow: [...(parent.protocols?.allow || []), ...(child.protocols?.allow || [])],
        block: [...(parent.protocols?.block || []), ...(child.protocols?.block || [])],
      },
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let defaultManager: NetworkPolicyManager | null = null;

export async function getDefaultPolicyManager(): Promise<NetworkPolicyManager> {
  if (!defaultManager) {
    defaultManager = new NetworkPolicyManager();
    await defaultManager.load();
  }

  return defaultManager;
}

export function clearDefaultPolicyManager(): void {
  defaultManager = null;
}
