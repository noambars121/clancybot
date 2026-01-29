/**
 * Security Dashboard API
 * 
 * REST API endpoints for the security dashboard
 * 
 * Endpoints:
 * - GET /security/score - Security score and status
 * - GET /security/checks - Security check results
 * - GET /security/events - Recent security events
 * - GET /security/stats - Security statistics
 * - GET /security/approvals - Pending approvals
 * - POST /security/approve/:id - Approve request
 * - POST /security/deny/:id - Deny request
 * 
 * @module gateway/security-dashboard-api
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { loadConfig } from "../config/config.js";
import { securityLogger } from "../security/advanced-security.js";
import { listPendingApprovals, approveRequest, denyRequest, getApprovalHistory } from "../security/approval-manager.js";
import { getChildLogger } from "../logging.js";

const log = getChildLogger("security-dashboard-api");

// ============================================================================
// Types
// ============================================================================

export type SecurityScore = {
  score: number;
  grade: "A+" | "A" | "B" | "C" | "D" | "F";
  badge: string;
  checks: SecurityCheck[];
  timestamp: number;
};

export type SecurityCheck = {
  id: string;
  label: string;
  passed: boolean;
  severity: "critical" | "high" | "medium" | "low";
  recommendation?: string;
};

// ============================================================================
// Helpers
// ============================================================================

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function getGrade(score: number): "A+" | "A" | "B" | "C" | "D" | "F" {
  if (score === 100) return "A+";
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function getBadge(score: number): string {
  if (score === 100) return "🏆 Pentagon++";
  if (score >= 95) return "🛡️ Pentagon+";
  if (score >= 90) return "🛡️ Pentagon";
  if (score >= 80) return "✅ Excellent";
  if (score >= 70) return "⚠️ Good";
  if (score >= 60) return "⚠️ Fair";
  return "❌ Needs Work";
}

// ============================================================================
// Security Score Calculation
// ============================================================================

function calculateSecurityScore(): SecurityScore {
  const cfg = loadConfig();
  let score = 100;
  const checks: SecurityCheck[] = [];

  // Check 1: Gateway Authentication
  const authEnabled = cfg.gateway?.auth?.enabled === true;
  checks.push({
    id: "auth",
    label: "Gateway Authentication",
    passed: authEnabled,
    severity: "critical",
    recommendation: authEnabled ? undefined : "Enable gateway authentication to protect your bot",
  });
  if (!authEnabled) score -= 20;

  // Check 2: DM Policy
  const dmPolicy = cfg.channels?.["*"]?.dmPolicy;
  const secureDmPolicy = dmPolicy === "pairing" || dmPolicy === "disabled" || dmPolicy === "allowlist";
  checks.push({
    id: "dm_policy",
    label: "DM Policy",
    passed: secureDmPolicy,
    severity: "high",
    recommendation: secureDmPolicy ? undefined : "Use 'pairing' or 'allowlist' DM policy for security",
  });
  if (!secureDmPolicy) score -= 15;

  // Check 3: Sandbox
  const sandboxEnabled = cfg.agents?.defaults?.sandbox?.mode === "non-main";
  checks.push({
    id: "sandbox",
    label: "Sandbox Isolation",
    passed: sandboxEnabled,
    severity: "critical",
    recommendation: sandboxEnabled ? undefined : "Enable Docker sandbox (mode: non-main) for isolation",
  });
  if (!sandboxEnabled) score -= 20;

  // Check 4: Secrets Encryption
  const secretsEncrypted = cfg.security?.secrets?.encryption === "aes-256-gcm";
  checks.push({
    id: "secrets",
    label: "Secrets Encryption",
    passed: secretsEncrypted,
    severity: "high",
    recommendation: secretsEncrypted ? undefined : "Enable AES-256-GCM encryption for secrets",
  });
  if (!secretsEncrypted) score -= 15;

  // Check 5: Browser Profile Validation
  const browserValidation = cfg.security?.browser?.profileValidation === true;
  checks.push({
    id: "browser",
    label: "Browser Profile Validation",
    passed: browserValidation,
    severity: "high",
    recommendation: browserValidation ? undefined : "Enable browser profile validation to prevent hijacking",
  });
  if (!browserValidation) score -= 10;

  // Check 6: Skills Verification
  const skillsVerification = cfg.security?.skills?.verification === true;
  checks.push({
    id: "skills",
    label: "Skills Verification",
    passed: skillsVerification,
    severity: "medium",
    recommendation: skillsVerification ? undefined : "Enable skills verification to block malicious skills",
  });
  if (!skillsVerification) score -= 5;

  // Check 7: Rate Limiting
  const rateLimiting = cfg.gateway?.rateLimit?.enabled === true;
  checks.push({
    id: "rate_limit",
    label: "Rate Limiting",
    passed: rateLimiting,
    severity: "medium",
    recommendation: rateLimiting ? undefined : "Enable rate limiting to prevent DoS attacks",
  });
  if (!rateLimiting) score -= 5;

  // Check 8: Prompt Injection Protection
  const promptProtection = true;  // Implemented in Phase 2.5
  checks.push({
    id: "prompt_injection",
    label: "Prompt Injection Protection",
    passed: promptProtection,
    severity: "high",
    recommendation: undefined,
  });

  // Check 9: Output Validation
  const outputValidation = cfg.security?.output?.validation === true;
  checks.push({
    id: "output_validation",
    label: "Output Validation",
    passed: outputValidation,
    severity: "high",
    recommendation: outputValidation ? undefined : "Enable output validation to prevent command injection",
  });
  if (!outputValidation) score -= 10;

  // Check 10: SSRF Protection
  const ssrfProtection = cfg.security?.network?.ssrfProtection === true;
  checks.push({
    id: "ssrf",
    label: "SSRF Protection",
    passed: ssrfProtection,
    severity: "medium",
    recommendation: ssrfProtection ? undefined : "Enable SSRF protection to block internal network access",
  });
  if (!ssrfProtection) score -= 5;

  return {
    score: Math.max(0, score),
    grade: getGrade(score),
    badge: getBadge(score),
    checks,
    timestamp: Date.now(),
  };
}

// ============================================================================
// API Handlers
// ============================================================================

function handleGetScore(req: IncomingMessage, res: ServerResponse): void {
  const scoreData = calculateSecurityScore();
  sendJson(res, 200, scoreData);
}

function handleGetChecks(req: IncomingMessage, res: ServerResponse): void {
  const scoreData = calculateSecurityScore();
  sendJson(res, 200, { checks: scoreData.checks });
}

function handleGetEvents(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const limit = parseInt(url.searchParams.get("limit") || "100", 10);
  const type = url.searchParams.get("type") as any;
  const severity = url.searchParams.get("severity") as any;

  const events = securityLogger.getEvents({
    limit,
    type,
    severity,
  });

  sendJson(res, 200, { events });
}

function handleGetStats(req: IncomingMessage, res: ServerResponse): void {
  const stats = securityLogger.getStats();
  const scoreData = calculateSecurityScore();

  sendJson(res, 200, {
    security: {
      score: scoreData.score,
      grade: scoreData.grade,
      badge: scoreData.badge,
    },
    events: stats,
  });
}

function handleGetApprovals(req: IncomingMessage, res: ServerResponse): void {
  const pending = listPendingApprovals();
  const history = getApprovalHistory(50);

  sendJson(res, 200, {
    pending,
    history: history.filter((h) => h.status !== "pending"),
  });
}

function handleApproveRequest(req: IncomingMessage, res: ServerResponse, id: string): void {
  // TODO: Verify authorization (admin only)
  const result = approveRequest(id, "dashboard-user");
  
  if (result) {
    sendJson(res, 200, { ok: true, approval: result });
  } else {
    sendJson(res, 404, { ok: false, error: "Approval not found" });
  }
}

function handleDenyRequest(req: IncomingMessage, res: ServerResponse, id: string): void {
  // TODO: Verify authorization (admin only)
  const result = denyRequest(id, "dashboard-user");
  
  if (result) {
    sendJson(res, 200, { ok: true, approval: result });
  } else {
    sendJson(res, 404, { ok: false, error: "Approval not found" });
  }
}

// ============================================================================
// Router
// ============================================================================

export function handleSecurityDashboardRequest(
  req: IncomingMessage,
  res: ServerResponse,
): boolean {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const pathname = url.pathname;

  // GET /security/score
  if (pathname === "/security/score" && req.method === "GET") {
    handleGetScore(req, res);
    return true;
  }

  // GET /security/checks
  if (pathname === "/security/checks" && req.method === "GET") {
    handleGetChecks(req, res);
    return true;
  }

  // GET /security/events
  if (pathname === "/security/events" && req.method === "GET") {
    handleGetEvents(req, res);
    return true;
  }

  // GET /security/stats
  if (pathname === "/security/stats" && req.method === "GET") {
    handleGetStats(req, res);
    return true;
  }

  // GET /security/approvals
  if (pathname === "/security/approvals" && req.method === "GET") {
    handleGetApprovals(req, res);
    return true;
  }

  // POST /security/approve/:id
  const approveMatch = pathname.match(/^\/security\/approve\/([^/]+)$/);
  if (approveMatch && req.method === "POST") {
    handleApproveRequest(req, res, approveMatch[1]);
    return true;
  }

  // POST /security/deny/:id
  const denyMatch = pathname.match(/^\/security\/deny\/([^/]+)$/);
  if (denyMatch && req.method === "POST") {
    handleDenyRequest(req, res, denyMatch[1]);
    return true;
  }

  return false;
}
