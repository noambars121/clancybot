/**
 * Role-Based Access Control (RBAC) System
 * 
 * Addresses OWASP A01: Broken Access Control
 * 
 * Implements comprehensive permission system for:
 * - Tool execution
 * - File system access
 * - Gateway method invocation
 * - Config modifications
 * - Sensitive operations
 * 
 * @module security/rbac
 */

import { getChildLogger } from "../logging.js";
import type { MoltbotConfig } from "../config/types.js";
import { existsSync } from "node:fs";
import { resolve, normalize } from "node:path";
import { homedir } from "node:os";

const log = getChildLogger({ module: "rbac" });

// ============================================================================
// Types
// ============================================================================

export type Permission =
  // Tool permissions
  | "tools.exec"
  | "tools.exec.elevated"
  | "tools.process"
  | "tools.filesystem.read"
  | "tools.filesystem.write"
  | "tools.filesystem.delete"
  | "tools.network"
  | "tools.browser"
  | "tools.canvas"
  | "tools.cron"
  | "tools.message"
  | "tools.agent_step"
  | "tools.node"
  | "tools.lobster"
  // Gateway permissions
  | "gateway.config.read"
  | "gateway.config.write"
  | "gateway.channels.manage"
  | "gateway.sessions.list"
  | "gateway.sessions.read"
  | "gateway.sessions.write"
  | "gateway.sessions.delete"
  | "gateway.pairing.approve"
  | "gateway.pairing.list"
  // Admin permissions
  | "admin.secrets.read"
  | "admin.secrets.write"
  | "admin.system.exec"
  | "admin.security.audit";

export type Role = "user" | "admin" | "restricted" | "guest";

export type AccessContext = {
  role: Role;
  sessionKey?: string;
  accountId?: string;
  channel?: string;
  isGroup?: boolean;
  sandboxed?: boolean;
  elevatedEnabled?: boolean;
  elevatedAllowed?: boolean;
};

export type AccessDecision = {
  allowed: boolean;
  reason?: string;
  requiresApproval?: boolean;
};

// ============================================================================
// Permission Registry
// ============================================================================

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    // Full access to everything
    "tools.exec",
    "tools.exec.elevated",
    "tools.process",
    "tools.filesystem.read",
    "tools.filesystem.write",
    "tools.filesystem.delete",
    "tools.network",
    "tools.browser",
    "tools.canvas",
    "tools.cron",
    "tools.message",
    "tools.agent_step",
    "tools.node",
    "tools.lobster",
    "gateway.config.read",
    "gateway.config.write",
    "gateway.channels.manage",
    "gateway.sessions.list",
    "gateway.sessions.read",
    "gateway.sessions.write",
    "gateway.sessions.delete",
    "gateway.pairing.approve",
    "gateway.pairing.list",
    "admin.secrets.read",
    "admin.secrets.write",
    "admin.system.exec",
    "admin.security.audit",
  ],
  
  user: [
    // Standard user: tools + basic gateway
    "tools.exec",
    "tools.process",
    "tools.filesystem.read",
    "tools.filesystem.write",
    "tools.network",
    "tools.browser",
    "tools.canvas",
    "tools.cron",
    "tools.message",
    "tools.agent_step",
    "tools.lobster",
    "gateway.config.read",
    "gateway.sessions.read",
  ],
  
  restricted: [
    // Restricted: read-only tools only
    "tools.filesystem.read",
    "tools.network",
    "gateway.config.read",
    "gateway.sessions.read",
  ],
  
  guest: [
    // Guest: minimal read access
    "tools.filesystem.read",
    "gateway.config.read",
  ],
};

// ============================================================================
// Path-based Access Control
// ============================================================================

/**
 * Sensitive paths that require elevated permissions
 */
const SENSITIVE_PATHS = [
  // Credentials
  "~/.aws",
  "~/.ssh",
  "~/.gnupg",
  "~/.moltbot/credentials",
  "~/.config/gcloud",
  // System
  "/etc",
  "/var",
  "/sys",
  "/proc",
  // Private keys
  "*.pem",
  "*.key",
  "*_rsa",
  "*_dsa",
  "*_ecdsa",
  "*_ed25519",
  // Config files
  ".env",
  ".env.*",
  "moltbot.json",
  // Secrets
  "*secret*",
  "*password*",
  "*token*",
  "*api?key*",
];

/**
 * Check if a file path is sensitive
 */
export function isSensitivePath(path: string): boolean {
  const normalizedPath = normalize(path).replace(/\\/g, "/");
  const expandedPath = normalizedPath.startsWith("~")
    ? normalizedPath.replace("~", homedir())
    : normalizedPath;

  for (const pattern of SENSITIVE_PATHS) {
    if (pattern.startsWith("~")) {
      const expandedPattern = pattern.replace("~", homedir());
      if (expandedPath.startsWith(expandedPattern)) {
        return true;
      }
    } else if (pattern.includes("*")) {
      const regex = new RegExp(
        "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
        "i",
      );
      if (regex.test(expandedPath.toLowerCase())) {
        return true;
      }
    } else if (expandedPath.includes(pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a path is outside the workspace (potentially dangerous)
 */
export function isOutsideWorkspace(path: string, workspaceDir: string): boolean {
  const normalizedPath = resolve(normalize(path));
  const normalizedWorkspace = resolve(normalize(workspaceDir));
  return !normalizedPath.startsWith(normalizedWorkspace);
}

// ============================================================================
// Permission Checking
// ============================================================================

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  return permissions.includes(permission);
}

/**
 * Check file system access permission
 */
export function checkFileAccess(
  ctx: AccessContext,
  path: string,
  operation: "read" | "write" | "delete",
  workspaceDir?: string,
): AccessDecision {
  // Map operation to permission
  const permissionMap = {
    read: "tools.filesystem.read" as Permission,
    write: "tools.filesystem.write" as Permission,
    delete: "tools.filesystem.delete" as Permission,
  };
  const permission = permissionMap[operation];

  // Check base permission
  if (!hasPermission(ctx.role, permission)) {
    return {
      allowed: false,
      reason: `Role '${ctx.role}' lacks permission '${permission}'`,
    };
  }

  // Check sensitive paths
  if (isSensitivePath(path)) {
    if (ctx.role !== "admin") {
      return {
        allowed: false,
        reason: `Sensitive path requires admin role: ${path}`,
        requiresApproval: true,
      };
    }
  }

  // Check workspace boundaries
  if (workspaceDir && isOutsideWorkspace(path, workspaceDir)) {
    if (ctx.role === "guest" || ctx.role === "restricted") {
      return {
        allowed: false,
        reason: `Access outside workspace denied for role '${ctx.role}': ${path}`,
      };
    }
    // User/admin can access outside workspace (may require approval later)
  }

  return { allowed: true };
}

/**
 * Check tool execution permission
 */
export function checkToolAccess(
  ctx: AccessContext,
  toolName: string,
  toolArgs?: Record<string, unknown>,
): AccessDecision {
  // Map tool names to permissions
  const toolPermissions: Record<string, Permission> = {
    exec: "tools.exec",
    process: "tools.process",
    read: "tools.filesystem.read",
    write: "tools.filesystem.write",
    delete: "tools.filesystem.delete",
    glob: "tools.filesystem.read",
    grep: "tools.filesystem.read",
    fetch: "tools.network",
    browser_navigate: "tools.browser",
    browser_click: "tools.browser",
    browser_type: "tools.browser",
    canvas_create: "tools.canvas",
    cron_add: "tools.cron",
    cron_list: "tools.cron",
    cron_remove: "tools.cron",
    message_send: "tools.message",
    agent_step: "tools.agent_step",
    node_invoke: "tools.node",
    lobster: "tools.lobster",
  };

  const permission = toolPermissions[toolName];
  if (!permission) {
    // Unknown tool - allow if user/admin
    if (ctx.role === "admin" || ctx.role === "user") {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Unknown tool '${toolName}' denied for role '${ctx.role}'`,
    };
  }

  // Check elevated exec
  if (toolName === "exec" && toolArgs?.elevated === true) {
    if (!hasPermission(ctx.role, "tools.exec.elevated")) {
      return {
        allowed: false,
        reason: "Elevated exec requires admin role",
        requiresApproval: true,
      };
    }
    if (!ctx.elevatedEnabled || !ctx.elevatedAllowed) {
      return {
        allowed: false,
        reason: "Elevated exec not enabled/allowed",
      };
    }
  }

  // Check base permission
  if (!hasPermission(ctx.role, permission)) {
    return {
      allowed: false,
      reason: `Role '${ctx.role}' lacks permission '${permission}' for tool '${toolName}'`,
    };
  }

  return { allowed: true };
}

/**
 * Check gateway method permission
 */
export function checkGatewayMethodAccess(
  ctx: AccessContext,
  method: string,
): AccessDecision {
  // Map methods to permissions
  const methodPermissions: Record<string, Permission> = {
    "config.get": "gateway.config.read",
    "config.set": "gateway.config.write",
    "config.merge": "gateway.config.write",
    "channels.list": "gateway.channels.manage",
    "channels.status": "gateway.channels.manage",
    "sessions.list": "gateway.sessions.list",
    "sessions.get": "gateway.sessions.read",
    "sessions.update": "gateway.sessions.write",
    "sessions.delete": "gateway.sessions.delete",
    "pairing.approve": "gateway.pairing.approve",
    "pairing.list": "gateway.pairing.list",
  };

  const permission = methodPermissions[method];
  if (!permission) {
    // Unknown method - deny for restricted/guest
    if (ctx.role === "restricted" || ctx.role === "guest") {
      return {
        allowed: false,
        reason: `Unknown method '${method}' denied for role '${ctx.role}'`,
      };
    }
    return { allowed: true };
  }

  if (!hasPermission(ctx.role, permission)) {
    return {
      allowed: false,
      reason: `Role '${ctx.role}' lacks permission '${permission}' for method '${method}'`,
    };
  }

  return { allowed: true };
}

// ============================================================================
// Role Resolution
// ============================================================================

/**
 * Resolve role from context and config
 */
export function resolveRole(
  ctx: Partial<AccessContext>,
  cfg: MoltbotConfig,
): Role {
  // Admin allowlist (from config)
  const adminAccountIds = cfg.security?.rbac?.adminAccountIds ?? [];
  const adminChannels = cfg.security?.rbac?.adminChannels ?? [];

  if (ctx.accountId && adminAccountIds.includes(ctx.accountId)) {
    return "admin";
  }

  if (ctx.channel && adminChannels.includes(ctx.channel)) {
    return "admin";
  }

  // Default: user role
  return "user";
}

// ============================================================================
// Audit Logging
// ============================================================================

/**
 * Log access control decision
 */
export function logAccessDecision(
  permission: Permission,
  ctx: AccessContext,
  decision: AccessDecision,
  details?: Record<string, unknown>,
) {
  const logData = {
    permission,
    role: ctx.role,
    allowed: decision.allowed,
    reason: decision.reason,
    requiresApproval: decision.requiresApproval,
    accountId: ctx.accountId,
    channel: ctx.channel,
    sessionKey: ctx.sessionKey,
    ...details,
  };

  if (decision.allowed) {
    log.debug("RBAC: Access granted", logData);
  } else {
    log.warn("RBAC: Access denied", logData);
  }
}

// ============================================================================
// Export
// ============================================================================

export const RBAC = {
  hasPermission,
  checkFileAccess,
  checkToolAccess,
  checkGatewayMethodAccess,
  resolveRole,
  isSensitivePath,
  isOutsideWorkspace,
  logAccessDecision,
};
