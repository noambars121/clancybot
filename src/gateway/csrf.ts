/**
 * CSRF (Cross-Site Request Forgery) Protection
 *
 * Implements token-based CSRF protection:
 * 1. Generate unique token per session
 * 2. Include in responses (header + form)
 * 3. Validate on state-changing requests (POST, PUT, DELETE)
 *
 * @see Phase 9 - Pentagon+++ Security
 */

import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { getChildLogger } from "../logging.js";

const log = getChildLogger("csrf");

// ============================================================================
// Types
// ============================================================================

export type CSRFSession = {
  token: string;
  created: number;
  lastUsed: number;
};

// ============================================================================
// CSRF Manager
// ============================================================================

export class CSRFManager {
  private sessions: Map<string, CSRFSession> = new Map();
  private tokenLifetime = 3600000; // 1 hour

  /**
   * Generate CSRF token for session
   */
  generateToken(sessionId: string): string {
    const token = randomBytes(32).toString("hex");

    this.sessions.set(sessionId, {
      token,
      created: Date.now(),
      lastUsed: Date.now(),
    });

    log.debug("Generated CSRF token", { sessionId: sessionId.slice(0, 8) });

    return token;
  }

  /**
   * Validate CSRF token
   */
  validateToken(sessionId: string, providedToken: string): boolean {
    const session = this.sessions.get(sessionId);

    if (!session) {
      log.warn("CSRF validation failed: No session", { sessionId });
      return false;
    }

    // Check if token expired
    if (Date.now() - session.created > this.tokenLifetime) {
      log.warn("CSRF validation failed: Token expired", { sessionId });
      this.sessions.delete(sessionId);
      return false;
    }

    // Validate token (timing-safe comparison)
    const valid = timingSafeEqual(session.token, providedToken);

    if (valid) {
      // Update last used
      session.lastUsed = Date.now();
      log.debug("CSRF token validated", { sessionId: sessionId.slice(0, 8) });
    } else {
      log.warn("CSRF validation failed: Invalid token", { sessionId });
    }

    return valid;
  }

  /**
   * Get token for session
   */
  getToken(sessionId: string): string | undefined {
    return this.sessions.get(sessionId)?.token;
  }

  /**
   * Delete token (on logout)
   */
  deleteToken(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Clean up expired tokens
   */
  cleanup(): void {
    const now = Date.now();
    let removed = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.created > this.tokenLifetime) {
        this.sessions.delete(sessionId);
        removed++;
      }
    }

    if (removed > 0) {
      log.debug("Cleaned up expired CSRF tokens", { count: removed });
    }
  }
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * Extract session ID from request
 */
export function getSessionId(req: IncomingMessage): string {
  // Try to get from cookie or header
  const cookies = parseCookies(req);
  return cookies.sessionId || req.headers["x-session-id"] || "anonymous";
}

/**
 * Middleware: Add CSRF token to response
 */
export function addCSRFToken(
  res: ServerResponse,
  csrfManager: CSRFManager,
  sessionId: string
): void {
  let token = csrfManager.getToken(sessionId);

  if (!token) {
    token = csrfManager.generateToken(sessionId);
  }

  // Add to header
  res.setHeader("X-CSRF-Token", token);

  // Add to cookie (for JavaScript access)
  res.setHeader("Set-Cookie", `CSRF-Token=${token}; SameSite=Strict; Path=/; HttpOnly=false`);
}

/**
 * Middleware: Validate CSRF token
 */
export function validateCSRF(
  req: IncomingMessage,
  csrfManager: CSRFManager,
  sessionId: string
): boolean {
  // Only check for state-changing methods
  const method = req.method?.toUpperCase();
  if (method !== "POST" && method !== "PUT" && method !== "DELETE" && method !== "PATCH") {
    return true; // Skip validation for safe methods
  }

  // Get token from header
  const providedToken = req.headers["x-csrf-token"] as string | undefined;

  if (!providedToken) {
    log.warn("CSRF validation failed: No token provided");
    return false;
  }

  return csrfManager.validateToken(sessionId, providedToken);
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Timing-safe string comparison
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Parse cookies from request
 */
function parseCookies(req: IncomingMessage): Record<string, string> {
  const cookies: Record<string, string> = {};
  const cookieHeader = req.headers.cookie;

  if (!cookieHeader) {
    return cookies;
  }

  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const [key, value] = pair.trim().split("=");
    if (key && value) {
      cookies[key] = decodeURIComponent(value);
    }
  }

  return cookies;
}

// ============================================================================
// Singleton
// ============================================================================

let defaultManager: CSRFManager | null = null;

export function getDefaultCSRFManager(): CSRFManager {
  if (!defaultManager) {
    defaultManager = new CSRFManager();

    // Start cleanup interval (every 10 minutes)
    setInterval(() => {
      defaultManager!.cleanup();
    }, 600000);
  }

  return defaultManager;
}
