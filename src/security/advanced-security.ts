/**
 * Advanced Security Features
 * 
 * Addresses:
 * - OWASP LLM04: Model DoS (rate limiting, size limits)
 * - OWASP A10: SSRF (Server-Side Request Forgery)
 * - OWASP A09: Security Logging & Monitoring
 * 
 * @module security/advanced-security
 */

import { getChildLogger } from "../logging.js";

const log = getChildLogger({ module: "advanced-security" });

// ============================================================================
// DoS Protection (LLM04)
// ============================================================================

export type RateLimitConfig = {
  maxRequests: number;
  windowMs: number;
  maxMessageLength: number;
  maxToolCalls: number;
  maxConcurrentRequests: number;
};

export type RateLimitStatus = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  reason?: string;
};

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 100,  // 100 requests
  windowMs: 3600000,  // per hour
  maxMessageLength: 100000,  // 100KB per message
  maxToolCalls: 50,  // 50 tool calls per request
  maxConcurrentRequests: 10,  // 10 concurrent requests
};

class DoSProtection {
  private requestCounts = new Map<string, { count: number; resetAt: number }>();
  private concurrentRequests = new Map<string, number>();

  checkRateLimit(
    identifier: string,
    config: Partial<RateLimitConfig> = {},
  ): RateLimitStatus {
    const cfg = { ...DEFAULT_RATE_LIMIT, ...config };
    const now = Date.now();

    // Get or create request counter
    let counter = this.requestCounts.get(identifier);
    if (!counter || now > counter.resetAt) {
      counter = { count: 0, resetAt: now + cfg.windowMs };
      this.requestCounts.set(identifier, counter);
    }

    // Check limit
    if (counter.count >= cfg.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: counter.resetAt,
        reason: `Rate limit exceeded: ${cfg.maxRequests} requests per ${cfg.windowMs}ms`,
      };
    }

    // Increment and allow
    counter.count++;
    return {
      allowed: true,
      remaining: cfg.maxRequests - counter.count,
      resetAt: counter.resetAt,
    };
  }

  checkMessageSize(message: string, maxLength = DEFAULT_RATE_LIMIT.maxMessageLength): boolean {
    return message.length <= maxLength;
  }

  checkToolCallLimit(toolCalls: number, maxCalls = DEFAULT_RATE_LIMIT.maxToolCalls): boolean {
    return toolCalls <= maxCalls;
  }

  checkConcurrency(
    identifier: string,
    maxConcurrent = DEFAULT_RATE_LIMIT.maxConcurrentRequests,
  ): boolean {
    const current = this.concurrentRequests.get(identifier) || 0;
    return current < maxConcurrent;
  }

  incrementConcurrency(identifier: string): void {
    const current = this.concurrentRequests.get(identifier) || 0;
    this.concurrentRequests.set(identifier, current + 1);
  }

  decrementConcurrency(identifier: string): void {
    const current = this.concurrentRequests.get(identifier) || 0;
    if (current > 0) {
      this.concurrentRequests.set(identifier, current - 1);
    }
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, counter] of this.requestCounts.entries()) {
      if (now > counter.resetAt) {
        this.requestCounts.delete(key);
      }
    }
  }
}

export const dosProtection = new DoSProtection();

// ============================================================================
// SSRF Protection (A10)
// ============================================================================

export type SSRFCheckResult = {
  allowed: boolean;
  reason?: string;
  url: string;
};

/**
 * Blocked IP ranges (private networks, localhost, cloud metadata)
 */
const BLOCKED_IP_RANGES = [
  // Loopback
  { start: "127.0.0.0", end: "127.255.255.255" },
  // Private 10.x
  { start: "10.0.0.0", end: "10.255.255.255" },
  // Private 172.16-31.x
  { start: "172.16.0.0", end: "172.31.255.255" },
  // Private 192.168.x
  { start: "192.168.0.0", end: "192.168.255.255" },
  // Link-local
  { start: "169.254.0.0", end: "169.254.255.255" },
  // Multicast
  { start: "224.0.0.0", end: "239.255.255.255" },
  // Reserved
  { start: "240.0.0.0", end: "255.255.255.255" },
];

/**
 * Blocked hostnames
 */
const BLOCKED_HOSTNAMES = [
  "localhost",
  "0.0.0.0",
  "[::]",
  "::1",
  "metadata.google.internal",
  "169.254.169.254",  // AWS/GCP metadata
  "fd00:ec2::254",  // AWS IPv6 metadata
];

/**
 * Convert IP address to number for range checking
 */
function ipToNumber(ip: string): number {
  const parts = ip.split(".").map(Number);
  return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

/**
 * Check if IP is in a blocked range
 */
function isBlockedIp(ip: string): boolean {
  const ipNum = ipToNumber(ip);
  
  for (const range of BLOCKED_IP_RANGES) {
    const startNum = ipToNumber(range.start);
    const endNum = ipToNumber(range.end);
    
    if (ipNum >= startNum && ipNum <= endNum) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check URL for SSRF vulnerabilities
 */
export function checkSSRF(url: string, allowedHosts: string[] = []): SSRFCheckResult {
  try {
    const parsed = new URL(url);

    // Block file:// protocol
    if (parsed.protocol === "file:") {
      return {
        allowed: false,
        reason: "file:// protocol is blocked",
        url,
      };
    }

    // Block ftp://
    if (parsed.protocol === "ftp:") {
      return {
        allowed: false,
        reason: "ftp:// protocol is blocked",
        url,
      };
    }

    // Check hostname blocklist
    if (BLOCKED_HOSTNAMES.includes(parsed.hostname.toLowerCase())) {
      return {
        allowed: false,
        reason: `Hostname is blocked: ${parsed.hostname}`,
        url,
      };
    }

    // Check IP ranges (if hostname is an IP)
    const ipMatch = parsed.hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipMatch) {
      if (isBlockedIp(parsed.hostname)) {
        return {
          allowed: false,
          reason: `IP address is in blocked range: ${parsed.hostname}`,
          url,
        };
      }
    }

    // Check allowlist (if provided)
    if (allowedHosts.length > 0) {
      if (!allowedHosts.includes(parsed.hostname)) {
        return {
          allowed: false,
          reason: `Host not in allowlist: ${parsed.hostname}`,
          url,
        };
      }
    }

    // Block suspicious ports
    const suspiciousPorts = [22, 23, 3306, 5432, 6379, 27017];  // SSH, Telnet, DBs
    const port = parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === "https:" ? 443 : 80);
    
    if (suspiciousPorts.includes(port)) {
      return {
        allowed: false,
        reason: `Suspicious port: ${port}`,
        url,
      };
    }

    return { allowed: true, url };
  } catch (err) {
    return {
      allowed: false,
      reason: `Invalid URL: ${err instanceof Error ? err.message : String(err)}`,
      url,
    };
  }
}

// ============================================================================
// Security Logging & Monitoring (A09)
// ============================================================================

export type SecurityEvent = {
  type: "auth" | "access" | "tool" | "file" | "network" | "config" | "error";
  severity: "low" | "medium" | "high" | "critical";
  action: string;
  success: boolean;
  details: Record<string, unknown>;
  timestamp: number;
  sessionKey?: string;
  accountId?: string;
  channel?: string;
};

class SecurityLogger {
  private events: SecurityEvent[] = [];
  private readonly maxEvents = 10000;

  log(event: Omit<SecurityEvent, "timestamp">): void {
    const fullEvent: SecurityEvent = {
      ...event,
      timestamp: Date.now(),
    };

    this.events.push(fullEvent);

    // Trim old events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Log to console based on severity
    const logMethod = event.severity === "critical" || event.severity === "high" ? "warn" : "info";
    log[logMethod](`Security event: ${event.type}/${event.action}`, {
      success: event.success,
      severity: event.severity,
      ...event.details,
    });

    // Alert on critical events
    if (event.severity === "critical" && !event.success) {
      this.alertCriticalEvent(fullEvent);
    }
  }

  private alertCriticalEvent(event: SecurityEvent): void {
    log.error("🚨 CRITICAL SECURITY EVENT 🚨", {
      type: event.type,
      action: event.action,
      details: event.details,
      timestamp: new Date(event.timestamp).toISOString(),
    });
  }

  getEvents(filters?: {
    type?: SecurityEvent["type"];
    severity?: SecurityEvent["severity"];
    success?: boolean;
    since?: number;
    limit?: number;
  }): SecurityEvent[] {
    let filtered = [...this.events];

    if (filters) {
      if (filters.type) {
        filtered = filtered.filter((e) => e.type === filters.type);
      }
      if (filters.severity) {
        filtered = filtered.filter((e) => e.severity === filters.severity);
      }
      if (filters.success !== undefined) {
        filtered = filtered.filter((e) => e.success === filters.success);
      }
    if (filters.since !== undefined) {
      filtered = filtered.filter((e) => e.timestamp >= filters.since!);
    }
      if (filters.limit) {
        filtered = filtered.slice(-filters.limit);
      }
    }

    return filtered;
  }

  getStats(): Record<string, number> {
    const stats: Record<string, number> = {
      total: this.events.length,
      auth: 0,
      access: 0,
      tool: 0,
      file: 0,
      network: 0,
      config: 0,
      error: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      success: 0,
      failure: 0,
    };

    for (const event of this.events) {
      stats[event.type]++;
      stats[event.severity]++;
      if (event.success) {
        stats.success++;
      } else {
        stats.failure++;
      }
    }

    return stats;
  }

  clear(): void {
    this.events = [];
  }
}

export const securityLogger = new SecurityLogger();

// ============================================================================
// Convenience Functions
// ============================================================================

export function logAuthEvent(
  action: string,
  success: boolean,
  details: Record<string, unknown>,
): void {
  securityLogger.log({
    type: "auth",
    severity: success ? "low" : "high",
    action,
    success,
    details,
  });
}

export function logAccessEvent(
  action: string,
  success: boolean,
  details: Record<string, unknown>,
): void {
  securityLogger.log({
    type: "access",
    severity: success ? "low" : "medium",
    action,
    success,
    details,
  });
}

export function logToolEvent(
  toolName: string,
  success: boolean,
  details: Record<string, unknown>,
): void {
  securityLogger.log({
    type: "tool",
    severity: success ? "low" : "medium",
    action: `tool.${toolName}`,
    success,
    details,
  });
}

export function logFileEvent(
  operation: string,
  path: string,
  success: boolean,
): void {
  securityLogger.log({
    type: "file",
    severity: success ? "low" : "medium",
    action: `file.${operation}`,
    success,
    details: { path },
  });
}

export function logNetworkEvent(
  url: string,
  success: boolean,
  blocked?: string,
): void {
  securityLogger.log({
    type: "network",
    severity: blocked ? "high" : "low",
    action: "network.request",
    success,
    details: { url, blocked },
  });
}

// ============================================================================
// Export
// ============================================================================

export const AdvancedSecurity = {
  DoS: dosProtection,
  SSRF: { check: checkSSRF },
  Logging: securityLogger,
  logAuthEvent,
  logAccessEvent,
  logToolEvent,
  logFileEvent,
  logNetworkEvent,
};
