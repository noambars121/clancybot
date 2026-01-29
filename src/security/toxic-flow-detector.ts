/**
 * Toxic Flow Detector
 * 
 * Detects dangerous operation sequences (chains) that individually pass
 * validation but together form a malicious pattern.
 * 
 * Examples:
 * - Read sensitive file → Send to external URL (data exfiltration)
 * - Read credentials → Execute command (credential abuse)
 * - Multiple file reads → Network request (bulk data theft)
 * - Config read → Config write (privilege escalation)
 * 
 * Addresses: Sophisticated AI attacks (Snyk research on toxic chains)
 * 
 * @module security/toxic-flow-detector
 */

import { getChildLogger } from "../logging.js";

const log = getChildLogger({ module: "toxic-flow-detector" });

// ============================================================================
// Types
// ============================================================================

export type Operation = {
  type: "read" | "write" | "delete" | "exec" | "network" | "config" | "browser";
  timestamp: number;
  details: Record<string, unknown>;
  sessionKey?: string;
  accountId?: string;
};

export type FlowPattern = {
  id: string;
  name: string;
  description: string;
  severity: "critical" | "high" | "medium";
  steps: PatternStep[];
  maxTimeWindowMs: number; // Max time between first and last step
};

export type PatternStep = {
  type: Operation["type"];
  matcher: (op: Operation) => boolean;
  description: string;
};

export type FlowAnalysis = {
  dangerous: boolean;
  matchedPatterns: string[];
  riskLevel: "critical" | "high" | "medium" | "low";
  reason?: string;
  chain?: Operation[];
  recommendation?: string;
};

// ============================================================================
// Toxic Flow Patterns
// ============================================================================

const TOXIC_PATTERNS: FlowPattern[] = [
  // Pattern 1: Data Exfiltration (Read sensitive → Network)
  {
    id: "exfiltration-sensitive",
    name: "Sensitive Data Exfiltration",
    description: "Read sensitive file followed by external network request",
    severity: "critical",
    maxTimeWindowMs: 60000, // 1 minute
    steps: [
      {
        type: "read",
        matcher: (op) => {
          const path = String(op.details.path || "").toLowerCase();
          return (
            path.includes("password") ||
            path.includes("secret") ||
            path.includes("credential") ||
            path.includes(".env") ||
            path.includes(".key") ||
            path.includes(".pem") ||
            path.includes("token") ||
            path.includes("api") ||
            path.includes(".ssh")
          );
        },
        description: "Read sensitive file",
      },
      {
        type: "network",
        matcher: (op) => {
          const url = String(op.details.url || "");
          // External URL (not localhost)
          return (
            url.startsWith("http") &&
            !url.includes("localhost") &&
            !url.includes("127.0.0.1")
          );
        },
        description: "Send to external URL",
      },
    ],
  },

  // Pattern 2: Credential Abuse (Read creds → Exec)
  {
    id: "credential-abuse",
    name: "Credential Abuse",
    description: "Read credentials followed by command execution",
    severity: "critical",
    maxTimeWindowMs: 120000, // 2 minutes
    steps: [
      {
        type: "read",
        matcher: (op) => {
          const path = String(op.details.path || "").toLowerCase();
          return (
            path.includes("credential") ||
            path.includes("password") ||
            path.includes("secret") ||
            path.includes("token")
          );
        },
        description: "Read credentials",
      },
      {
        type: "exec",
        matcher: () => true,
        description: "Execute command",
      },
    ],
  },

  // Pattern 3: Bulk Data Collection (Multiple reads → Network)
  {
    id: "bulk-data-theft",
    name: "Bulk Data Theft",
    description: "Multiple file reads followed by network request",
    severity: "high",
    maxTimeWindowMs: 300000, // 5 minutes
    steps: [
      {
        type: "read",
        matcher: () => true,
        description: "Read file (1)",
      },
      {
        type: "read",
        matcher: () => true,
        description: "Read file (2)",
      },
      {
        type: "read",
        matcher: () => true,
        description: "Read file (3)",
      },
      {
        type: "read",
        matcher: () => true,
        description: "Read file (4)",
      },
      {
        type: "read",
        matcher: () => true,
        description: "Read file (5+)",
      },
      {
        type: "network",
        matcher: (op) => {
          const url = String(op.details.url || "");
          return url.startsWith("http");
        },
        description: "Send aggregated data",
      },
    ],
  },

  // Pattern 4: Config Tampering (Read config → Write config)
  {
    id: "config-tampering",
    name: "Configuration Tampering",
    description: "Read config followed by config modification",
    severity: "high",
    maxTimeWindowMs: 60000,
    steps: [
      {
        type: "config",
        matcher: (op) => op.details.operation === "read",
        description: "Read config",
      },
      {
        type: "config",
        matcher: (op) => op.details.operation === "write",
        description: "Modify config",
      },
    ],
  },

  // Pattern 5: Ransomware Behavior (Multiple deletions)
  {
    id: "mass-deletion",
    name: "Mass File Deletion",
    description: "Multiple file deletions in rapid succession",
    severity: "critical",
    maxTimeWindowMs: 60000,
    steps: [
      {
        type: "delete",
        matcher: () => true,
        description: "Delete file (1)",
      },
      {
        type: "delete",
        matcher: () => true,
        description: "Delete file (2)",
      },
      {
        type: "delete",
        matcher: () => true,
        description: "Delete file (3)",
      },
    ],
  },

  // Pattern 6: Browser Hijack (Navigate → File write)
  {
    id: "download-poisoning",
    name: "Malicious Download",
    description: "Browser navigation followed by suspicious file write",
    severity: "high",
    maxTimeWindowMs: 30000,
    steps: [
      {
        type: "browser",
        matcher: (op) => {
          const url = String(op.details.url || "");
          return url.startsWith("http");
        },
        description: "Navigate to URL",
      },
      {
        type: "write",
        matcher: (op) => {
          const path = String(op.details.path || "").toLowerCase();
          return (
            path.endsWith(".exe") ||
            path.endsWith(".sh") ||
            path.endsWith(".bat") ||
            path.endsWith(".ps1") ||
            path.endsWith(".app")
          );
        },
        description: "Write executable file",
      },
    ],
  },

  // Pattern 7: Privilege Escalation (Read sudo config → Exec)
  {
    id: "privilege-escalation",
    name: "Privilege Escalation Attempt",
    description: "Read system config followed by elevated execution",
    severity: "critical",
    maxTimeWindowMs: 60000,
    steps: [
      {
        type: "read",
        matcher: (op) => {
          const path = String(op.details.path || "").toLowerCase();
          return (
            path.includes("/etc/") ||
            path.includes("sudoers") ||
            path.includes("shadow") ||
            path.includes("passwd")
          );
        },
        description: "Read system config",
      },
      {
        type: "exec",
        matcher: (op) => op.details.elevated === true,
        description: "Execute with elevated privileges",
      },
    ],
  },
];

// ============================================================================
// Flow History
// ============================================================================

class FlowHistory {
  private operations: Operation[] = [];
  private readonly maxHistorySize = 1000;
  private readonly maxHistoryAgeMs = 600000; // 10 minutes

  add(operation: Operation): void {
    this.operations.push(operation);

    // Cleanup old operations
    if (this.operations.length > this.maxHistorySize) {
      this.operations = this.operations.slice(-this.maxHistorySize);
    }

    const cutoff = Date.now() - this.maxHistoryAgeMs;
    this.operations = this.operations.filter((op) => op.timestamp > cutoff);
  }

  getRecent(count: number, sessionKey?: string): Operation[] {
    let ops = this.operations;

    if (sessionKey) {
      ops = ops.filter((op) => op.sessionKey === sessionKey);
    }

    return ops.slice(-count);
  }

  getRecentInTimeWindow(windowMs: number, sessionKey?: string): Operation[] {
    const cutoff = Date.now() - windowMs;
    let ops = this.operations.filter((op) => op.timestamp > cutoff);

    if (sessionKey) {
      ops = ops.filter((op) => op.sessionKey === sessionKey);
    }

    return ops;
  }

  clear(): void {
    this.operations = [];
  }
}

const flowHistory = new FlowHistory();

// ============================================================================
// Pattern Matching
// ============================================================================

/**
 * Check if a sequence of operations matches a pattern
 */
function matchesPattern(ops: Operation[], pattern: FlowPattern): boolean {
  if (ops.length < pattern.steps.length) {
    return false;
  }

  // Check time window
  const firstOpTime = ops[0].timestamp;
  const lastOpTime = ops[ops.length - 1].timestamp;
  if (lastOpTime - firstOpTime > pattern.maxTimeWindowMs) {
    return false;
  }

  // Try to match pattern steps sequentially
  let patternIndex = 0;

  for (const op of ops) {
    const step = pattern.steps[patternIndex];

    if (op.type === step.type && step.matcher(op)) {
      patternIndex++;

      if (patternIndex === pattern.steps.length) {
        return true; // All steps matched!
      }
    }
  }

  return false;
}

/**
 * Find matching patterns in operation history
 */
function findMatchingPatterns(
  recentOps: Operation[],
): Array<{ pattern: FlowPattern; matchedOps: Operation[] }> {
  const matches: Array<{ pattern: FlowPattern; matchedOps: Operation[] }> = [];

  for (const pattern of TOXIC_PATTERNS) {
    // Try sliding window
    for (let i = 0; i <= recentOps.length - pattern.steps.length; i++) {
      const window = recentOps.slice(i, i + pattern.steps.length + 10); // Extra ops for flexibility

      if (matchesPattern(window, pattern)) {
        matches.push({
          pattern,
          matchedOps: window.slice(0, pattern.steps.length),
        });
        break; // Only count once per pattern
      }
    }
  }

  return matches;
}

// ============================================================================
// Main Detection
// ============================================================================

/**
 * Record an operation and check for toxic flows
 */
export function checkFlow(operation: Operation): FlowAnalysis {
  // Add to history
  flowHistory.add(operation);

  // Get recent operations in same session
  const recentOps = flowHistory.getRecentInTimeWindow(600000, operation.sessionKey); // Last 10 minutes

  // Find matching patterns
  const matches = findMatchingPatterns(recentOps);

  if (matches.length === 0) {
    return {
      dangerous: false,
      matchedPatterns: [],
      riskLevel: "low",
    };
  }

  // Analyze matches
  const highestSeverity = matches.reduce((max, match) => {
    if (match.pattern.severity === "critical") return "critical";
    if (match.pattern.severity === "high" && max !== "critical") return "high";
    if (match.pattern.severity === "medium" && max === "low") return "medium";
    return max;
  }, "low" as "critical" | "high" | "medium" | "low");

  const patternNames = matches.map((m) => m.pattern.name);
  const primaryMatch = matches[0];

  const reason =
    `Toxic flow detected: ${primaryMatch.pattern.name}\n` +
    `Pattern: ${primaryMatch.pattern.description}\n` +
    `Matched operations:\n` +
    primaryMatch.matchedOps
      .map((op, i) => `  ${i + 1}. ${op.type} - ${JSON.stringify(op.details).slice(0, 100)}`)
      .join("\n");

  const recommendation =
    `This operation sequence is suspicious and may indicate:\n` +
    (highestSeverity === "critical"
      ? "• Data exfiltration attempt\n• Credential theft\n• System compromise"
      : "• Unusual behavior\n• Potential security risk") +
    `\n\nRecommendation: ${highestSeverity === "critical" ? "BLOCK" : "Review and verify intent"}`;

  log.warn("Toxic flow detected", {
    patterns: patternNames,
    severity: highestSeverity,
    operations: primaryMatch.matchedOps.length,
  });

  return {
    dangerous: true,
    matchedPatterns: patternNames,
    riskLevel: highestSeverity,
    reason,
    chain: primaryMatch.matchedOps,
    recommendation,
  };
}

/**
 * Clear flow history (for testing)
 */
export function clearFlowHistory(): void {
  flowHistory.clear();
}

/**
 * Get recent operations (for debugging)
 */
export function getRecentOperations(count = 20): Operation[] {
  return flowHistory.getRecent(count);
}

// ============================================================================
// Export
// ============================================================================

export const ToxicFlowDetector = {
  checkFlow,
  clearFlowHistory,
  getRecentOperations,
  patterns: TOXIC_PATTERNS,
};
