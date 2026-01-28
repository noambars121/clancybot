/**
 * Approval Manager for Sensitive Operations
 * 
 * Addresses OWASP LLM08: Excessive Agency
 * 
 * Requires explicit user approval for:
 * - File deletion
 * - Elevated command execution
 * - Sensitive file access
 * - Config modifications
 * - Data exfiltration risks
 * - Destructive operations
 * 
 * @module security/approval-manager
 */

import { log } from "../logging.js";
import type { MoltbotConfig } from "../config/schema.js";
import { isSensitivePath } from "./rbac.js";

// ============================================================================
// Types
// ============================================================================

export type ApprovalRequest = {
  id: string;
  operation: string;
  details: Record<string, unknown>;
  reason: string;
  timestamp: number;
  sessionKey?: string;
  accountId?: string;
  channel?: string;
};

export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";

export type ApprovalRecord = ApprovalRequest & {
  status: ApprovalStatus;
  respondedAt?: number;
  respondedBy?: string;
};

export type ApprovalDecision = {
  requiresApproval: boolean;
  reason?: string;
  riskLevel: "low" | "medium" | "high" | "critical";
};

// ============================================================================
// Approval Store (in-memory for now)
// ============================================================================

const pendingApprovals = new Map<string, ApprovalRecord>();
const approvalHistory: ApprovalRecord[] = [];

// ============================================================================
// Risk Assessment
// ============================================================================

/**
 * Assess if an operation requires approval
 */
export function assessOperationRisk(
  operation: string,
  args: Record<string, unknown>,
  cfg: MoltbotConfig,
): ApprovalDecision {
  // File deletion - always requires approval
  if (operation === "delete" || operation === "filesystem.delete") {
    return {
      requiresApproval: true,
      reason: "File deletion is a destructive operation",
      riskLevel: "high",
    };
  }

  // Elevated exec - requires approval
  if ((operation === "exec" || operation === "process") && args.elevated === true) {
    return {
      requiresApproval: true,
      reason: "Elevated command execution bypasses sandbox",
      riskLevel: "critical",
    };
  }

  // Sensitive file write
  if (operation === "write" || operation === "filesystem.write") {
    const path = typeof args.path === "string" ? args.path : "";
    if (isSensitivePath(path)) {
      return {
        requiresApproval: true,
        reason: `Writing to sensitive path: ${path}`,
        riskLevel: "critical",
      };
    }
  }

  // Sensitive file read
  if (operation === "read" || operation === "filesystem.read") {
    const path = typeof args.path === "string" ? args.path : "";
    if (isSensitivePath(path)) {
      return {
        requiresApproval: true,
        reason: `Reading sensitive file: ${path}`,
        riskLevel: "high",
      };
    }
  }

  // Network requests to non-allowlisted hosts
  if (operation === "fetch" || operation === "browser_navigate") {
    const url = typeof args.url === "string" ? args.url : "";
    const allowedHosts = cfg.security?.network?.allowedHosts ?? [];
    
    if (allowedHosts.length > 0) {
      try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        
        if (!allowedHosts.includes(hostname)) {
          return {
            requiresApproval: true,
            reason: `Network access to non-allowlisted host: ${hostname}`,
            riskLevel: "medium",
          };
        }
      } catch {
        // Invalid URL - will be caught by validator
      }
    }
  }

  // Config modifications
  if (operation === "config.set" || operation === "config.merge") {
    return {
      requiresApproval: true,
      reason: "Configuration changes affect system behavior",
      riskLevel: "high",
    };
  }

  // Session deletion
  if (operation === "sessions.delete") {
    return {
      requiresApproval: true,
      reason: "Deleting sessions removes conversation history",
      riskLevel: "medium",
    };
  }

  // Pairing approval (meta!)
  if (operation === "pairing.approve") {
    return {
      requiresApproval: false,  // Admin-only via RBAC
      reason: "Managed by RBAC",
      riskLevel: "low",
    };
  }

  // Cron job creation/modification
  if (operation === "cron_add" || operation === "cron_remove") {
    return {
      requiresApproval: true,
      reason: "Cron jobs execute code at scheduled times",
      riskLevel: "medium",
    };
  }

  // Message sending (potential spam/abuse)
  if (operation === "message_send") {
    const recipients = Array.isArray(args.to) ? args.to.length : 1;
    if (recipients > 10) {
      return {
        requiresApproval: true,
        reason: `Bulk message sending (${recipients} recipients)`,
        riskLevel: "medium",
      };
    }
  }

  // Default: no approval required
  return {
    requiresApproval: false,
    riskLevel: "low",
  };
}

// ============================================================================
// Approval Management
// ============================================================================

/**
 * Create an approval request
 */
export function createApprovalRequest(
  operation: string,
  details: Record<string, unknown>,
  context: {
    sessionKey?: string;
    accountId?: string;
    channel?: string;
  },
): ApprovalRequest {
  const id = `approval_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  
  const request: ApprovalRequest = {
    id,
    operation,
    details,
    reason: assessOperationRisk(operation, details, {} as MoltbotConfig).reason || "Requires approval",
    timestamp: Date.now(),
    sessionKey: context.sessionKey,
    accountId: context.accountId,
    channel: context.channel,
  };

  const record: ApprovalRecord = {
    ...request,
    status: "pending",
  };

  pendingApprovals.set(id, record);
  approvalHistory.push(record);

  log.info("Approval request created", {
    id,
    operation,
    sessionKey: context.sessionKey,
    accountId: context.accountId,
  });

  return request;
}

/**
 * Get approval request by ID
 */
export function getApprovalRequest(id: string): ApprovalRecord | undefined {
  return pendingApprovals.get(id);
}

/**
 * List pending approvals
 */
export function listPendingApprovals(filters?: {
  sessionKey?: string;
  accountId?: string;
  channel?: string;
}): ApprovalRecord[] {
  let approvals = Array.from(pendingApprovals.values()).filter(
    (approval) => approval.status === "pending",
  );

  if (filters) {
    if (filters.sessionKey) {
      approvals = approvals.filter((a) => a.sessionKey === filters.sessionKey);
    }
    if (filters.accountId) {
      approvals = approvals.filter((a) => a.accountId === filters.accountId);
    }
    if (filters.channel) {
      approvals = approvals.filter((a) => a.channel === filters.channel);
    }
  }

  return approvals;
}

/**
 * Approve a request
 */
export function approveRequest(
  id: string,
  respondedBy: string,
): ApprovalRecord | undefined {
  const record = pendingApprovals.get(id);
  if (!record) {
    log.warn("Approval request not found", { id });
    return undefined;
  }

  if (record.status !== "pending") {
    log.warn("Approval request already processed", { id, status: record.status });
    return record;
  }

  record.status = "approved";
  record.respondedAt = Date.now();
  record.respondedBy = respondedBy;

  log.info("Approval granted", {
    id,
    operation: record.operation,
    respondedBy,
  });

  // Keep in history but remove from pending
  pendingApprovals.delete(id);

  return record;
}

/**
 * Deny a request
 */
export function denyRequest(
  id: string,
  respondedBy: string,
): ApprovalRecord | undefined {
  const record = pendingApprovals.get(id);
  if (!record) {
    log.warn("Approval request not found", { id });
    return undefined;
  }

  if (record.status !== "pending") {
    log.warn("Approval request already processed", { id, status: record.status });
    return record;
  }

  record.status = "denied";
  record.respondedAt = Date.now();
  record.respondedBy = respondedBy;

  log.info("Approval denied", {
    id,
    operation: record.operation,
    respondedBy,
  });

  // Keep in history but remove from pending
  pendingApprovals.delete(id);

  return record;
}

/**
 * Expire old pending requests (after 1 hour)
 */
export function expirePendingApprovals(maxAgeMs = 3600000): number {
  const now = Date.now();
  let expired = 0;

  for (const [id, record] of pendingApprovals.entries()) {
    if (record.status === "pending" && now - record.timestamp > maxAgeMs) {
      record.status = "expired";
      record.respondedAt = now;
      pendingApprovals.delete(id);
      expired++;
      
      log.info("Approval request expired", {
        id,
        operation: record.operation,
        age: now - record.timestamp,
      });
    }
  }

  return expired;
}

/**
 * Get approval history
 */
export function getApprovalHistory(limit = 100): ApprovalRecord[] {
  return approvalHistory.slice(-limit);
}

/**
 * Clear approval history (for testing)
 */
export function clearApprovalHistory(): void {
  pendingApprovals.clear();
  approvalHistory.length = 0;
}

// ============================================================================
// Approval UI Helpers
// ============================================================================

/**
 * Format approval request for display (ENHANCED - Phase 8)
 */
export function formatApprovalRequest(request: ApprovalRequest): string {
  const lines = [];
  
  // Risk level header
  const risk = assessOperationRisk(request.operation, request.details, {} as MoltbotConfig);
  const riskEmoji = risk.riskLevel === "critical" ? "🚨" :
                    risk.riskLevel === "high" ? "⚠️" :
                    risk.riskLevel === "medium" ? "⚡" : "ℹ️";
  const riskLabel = risk.riskLevel.toUpperCase();
  
  lines.push(`${riskEmoji} ${riskLabel} RISK APPROVAL REQUIRED ${riskEmoji}`);
  lines.push(``);
  
  // Operation details
  lines.push(`Operation: ${request.operation.toUpperCase()}`);
  if (request.details.path) {
    lines.push(`Target: ${request.details.path}`);
  }
  if (request.details.url) {
    lines.push(`URL: ${request.details.url}`);
  }
  if (request.details.command) {
    lines.push(`Command: ${request.details.command}`);
  }
  lines.push(``);
  
  // Risk analysis
  lines.push(`${riskEmoji} RISK ANALYSIS:`);
  lines.push(`• ${request.reason}`);
  
  // Operation-specific warnings
  if (request.operation === "delete") {
    lines.push(`• Destructive operation (cannot be undone)`);
    lines.push(`• No backup available`);
  }
  if (request.operation === "exec" && request.details.elevated) {
    lines.push(`• Bypasses sandbox isolation`);
    lines.push(`• Runs with full system access`);
  }
  if (request.details.path && typeof request.details.path === "string") {
    const path = request.details.path;
    if (path.includes("password") || path.includes("secret") || path.includes(".env")) {
      lines.push(`• Accessing sensitive file`);
    }
  }
  lines.push(``);
  
  // Context
  lines.push(`🔍 CONTEXT:`);
  lines.push(`• Requested by: Agent conversation`);
  if (request.sessionKey) {
    lines.push(`• Session: ${request.sessionKey.slice(0, 12)}...`);
  }
  if (request.accountId) {
    lines.push(`• Account: ${request.accountId}`);
  }
  lines.push(``);
  
  // Technical details
  lines.push(`⚙️  TECHNICAL DETAILS:`);
  for (const [key, value] of Object.entries(request.details)) {
    const valueStr = typeof value === "string" && value.length > 100
      ? value.slice(0, 100) + "..."
      : JSON.stringify(value);
    lines.push(`• ${key}: ${valueStr}`);
  }
  lines.push(``);
  
  // Decision prompt
  lines.push(`Do you want to proceed?`);
  lines.push(`[N] No, cancel (RECOMMENDED for high risk)`);
  lines.push(`[Y] Yes, I understand the risks`);
  lines.push(``);
  lines.push(`Approval ID: ${request.id}`);
  lines.push(`Commands: approve ${request.id} OR deny ${request.id}`);

  return lines.join("\n");
}

/**
 * Format approval summary (for logs/UI)
 */
export function formatApprovalSummary(record: ApprovalRecord): string {
  const status = record.status === "approved" ? "✅" : record.status === "denied" ? "❌" : "⏳";
  return `${status} ${record.operation} (${record.status})`;
}

// ============================================================================
// Export
// ============================================================================

export const ApprovalManager = {
  assessOperationRisk,
  createApprovalRequest,
  getApprovalRequest,
  listPendingApprovals,
  approveRequest,
  denyRequest,
  expirePendingApprovals,
  getApprovalHistory,
  clearApprovalHistory,
  formatApprovalRequest,
  formatApprovalSummary,
};
