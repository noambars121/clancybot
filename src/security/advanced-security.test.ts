import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  dosProtection,
  checkSSRF,
  securityLogger,
  logAuthEvent,
  logToolEvent,
} from "./advanced-security.js";

describe("AdvancedSecurity", () => {
  describe("DoS Protection", () => {
    beforeEach(() => {
      dosProtection.cleanup();
    });

    describe("checkRateLimit", () => {
      it("allows requests within limit", () => {
        const result1 = dosProtection.checkRateLimit("user123");
        expect(result1.allowed).toBe(true);
        expect(result1.remaining).toBe(99);  // Default is 100

        const result2 = dosProtection.checkRateLimit("user123");
        expect(result2.allowed).toBe(true);
        expect(result2.remaining).toBe(98);
      });

      it("blocks requests over limit", () => {
        // Exhaust limit
        for (let i = 0; i < 100; i++) {
          dosProtection.checkRateLimit("user123", { maxRequests: 100 });
        }

        // 101st request blocked
        const result = dosProtection.checkRateLimit("user123", { maxRequests: 100 });
        expect(result.allowed).toBe(false);
        expect(result.remaining).toBe(0);
        expect(result.reason).toContain("Rate limit exceeded");
      });

      it("resets after time window", () => {
        vi.useFakeTimers();

        dosProtection.checkRateLimit("user123", { maxRequests: 5, windowMs: 1000 });
        dosProtection.checkRateLimit("user123", { maxRequests: 5, windowMs: 1000 });
        dosProtection.checkRateLimit("user123", { maxRequests: 5, windowMs: 1000 });
        dosProtection.checkRateLimit("user123", { maxRequests: 5, windowMs: 1000 });
        dosProtection.checkRateLimit("user123", { maxRequests: 5, windowMs: 1000 });

        // 6th request blocked
        const blocked = dosProtection.checkRateLimit("user123", { maxRequests: 5, windowMs: 1000 });
        expect(blocked.allowed).toBe(false);

        // Advance time past window
        vi.advanceTimersByTime(1001);

        // Now allowed again
        const allowed = dosProtection.checkRateLimit("user123", { maxRequests: 5, windowMs: 1000 });
        expect(allowed.allowed).toBe(true);
        expect(allowed.remaining).toBe(4);

        vi.useRealTimers();
      });

      it("tracks different users separately", () => {
        dosProtection.checkRateLimit("user1");
        dosProtection.checkRateLimit("user1");

        dosProtection.checkRateLimit("user2");

        const result1 = dosProtection.checkRateLimit("user1");
        expect(result1.remaining).toBe(97);  // user1 made 2 requests

        const result2 = dosProtection.checkRateLimit("user2");
        expect(result2.remaining).toBe(98);  // user2 made 1 request
      });
    });

    describe("checkMessageSize", () => {
      it("allows messages within limit", () => {
        const message = "Short message";
        expect(dosProtection.checkMessageSize(message, 1000)).toBe(true);
      });

      it("blocks oversized messages", () => {
        const message = "A".repeat(200000);
        expect(dosProtection.checkMessageSize(message, 100000)).toBe(false);
      });
    });

    describe("checkToolCallLimit", () => {
      it("allows tool calls within limit", () => {
        expect(dosProtection.checkToolCallLimit(10, 50)).toBe(true);
      });

      it("blocks excessive tool calls", () => {
        expect(dosProtection.checkToolCallLimit(100, 50)).toBe(false);
      });
    });

    describe("checkConcurrency", () => {
      afterEach(() => {
        // Reset concurrency counters
        dosProtection.decrementConcurrency("user123");
        dosProtection.decrementConcurrency("user123");
        dosProtection.decrementConcurrency("user123");
      });

      it("allows concurrent requests within limit", () => {
        expect(dosProtection.checkConcurrency("user123", 10)).toBe(true);
        dosProtection.incrementConcurrency("user123");
        
        expect(dosProtection.checkConcurrency("user123", 10)).toBe(true);
      });

      it("blocks excessive concurrency", () => {
        for (let i = 0; i < 10; i++) {
          dosProtection.incrementConcurrency("user123");
        }

        expect(dosProtection.checkConcurrency("user123", 10)).toBe(false);
      });

      it("decrements correctly", () => {
        dosProtection.incrementConcurrency("user123");
        dosProtection.incrementConcurrency("user123");
        dosProtection.incrementConcurrency("user123");

        dosProtection.decrementConcurrency("user123");

        expect(dosProtection.checkConcurrency("user123", 3)).toBe(true);
      });
    });
  });

  describe("SSRF Protection", () => {
    describe("checkSSRF", () => {
      it("allows safe URLs", () => {
        const result = checkSSRF("https://api.example.com/data");
        expect(result.allowed).toBe(true);
      });

      it("blocks file:// protocol", () => {
        const result = checkSSRF("file:///etc/passwd");
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("file://");
      });

      it("blocks ftp:// protocol", () => {
        const result = checkSSRF("ftp://ftp.example.com/file.txt");
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("ftp://");
      });

      it("blocks localhost", () => {
        const result = checkSSRF("http://localhost:8080/admin");
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("localhost");
      });

      it("blocks 127.0.0.1", () => {
        const result = checkSSRF("http://127.0.0.1:18789/config");
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("blocked range");
      });

      it("blocks 0.0.0.0", () => {
        const result = checkSSRF("http://0.0.0.0:5000/");
        expect(result.allowed).toBe(false);
      });

      it("blocks AWS metadata endpoint", () => {
        const result = checkSSRF("http://169.254.169.254/latest/meta-data/");
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("blocked range");
      });

      it("blocks private 10.x IPs", () => {
        const result = checkSSRF("http://10.0.1.5/internal");
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("blocked range");
      });

      it("blocks private 192.168 IPs", () => {
        const result = checkSSRF("http://192.168.1.1/router");
        expect(result.allowed).toBe(false);
      });

      it("blocks private 172.16-31 IPs", () => {
        const result = checkSSRF("http://172.16.0.10/internal");
        expect(result.allowed).toBe(false);
      });

      it("blocks suspicious ports", () => {
        const result1 = checkSSRF("http://example.com:22/");  // SSH
        expect(result1.allowed).toBe(false);
        expect(result1.reason).toContain("Suspicious port");

        const result2 = checkSSRF("http://example.com:3306/");  // MySQL
        expect(result2.allowed).toBe(false);
      });

      it("allows standard HTTP/HTTPS ports", () => {
        expect(checkSSRF("http://example.com/").allowed).toBe(true);
        expect(checkSSRF("https://example.com/").allowed).toBe(true);
        expect(checkSSRF("http://example.com:80/").allowed).toBe(true);
        expect(checkSSRF("https://example.com:443/").allowed).toBe(true);
      });

      it("enforces allowlist when provided", () => {
        const allowlist = ["api.example.com", "cdn.example.com"];

        const result1 = checkSSRF("https://api.example.com/data", allowlist);
        expect(result1.allowed).toBe(true);

        const result2 = checkSSRF("https://evil.com/data", allowlist);
        expect(result2.allowed).toBe(false);
        expect(result2.reason).toContain("not in allowlist");
      });

      it("handles invalid URLs", () => {
        const result = checkSSRF("not-a-url");
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("Invalid URL");
      });
    });
  });

  describe("Security Logging", () => {
    beforeEach(() => {
      securityLogger.clear();
    });

    describe("log", () => {
      it("logs security events", () => {
        securityLogger.log({
          type: "auth",
          severity: "medium",
          action: "login",
          success: true,
          details: { user: "alice" },
        });

        const events = securityLogger.getEvents();
        expect(events.length).toBe(1);
        expect(events[0].type).toBe("auth");
        expect(events[0].action).toBe("login");
        expect(events[0].success).toBe(true);
        expect(events[0].timestamp).toBeGreaterThan(0);
      });

      it("trims old events when limit reached", () => {
        // Log 11,000 events (max is 10,000)
        for (let i = 0; i < 11000; i++) {
          securityLogger.log({
            type: "tool",
            severity: "low",
            action: `action-${i}`,
            success: true,
            details: {},
          });
        }

        const events = securityLogger.getEvents();
        expect(events.length).toBe(10000);
      });
    });

    describe("getEvents", () => {
      beforeEach(() => {
        securityLogger.log({
          type: "auth",
          severity: "high",
          action: "failed_login",
          success: false,
          details: {},
        });
        securityLogger.log({
          type: "auth",
          severity: "low",
          action: "successful_login",
          success: true,
          details: {},
        });
        securityLogger.log({
          type: "tool",
          severity: "medium",
          action: "exec",
          success: true,
          details: {},
        });
      });

      it("returns all events by default", () => {
        const events = securityLogger.getEvents();
        expect(events.length).toBe(3);
      });

      it("filters by type", () => {
        const events = securityLogger.getEvents({ type: "auth" });
        expect(events.length).toBe(2);
        expect(events.every((e) => e.type === "auth")).toBe(true);
      });

      it("filters by severity", () => {
        const events = securityLogger.getEvents({ severity: "high" });
        expect(events.length).toBe(1);
        expect(events[0].severity).toBe("high");
      });

      it("filters by success", () => {
        const events = securityLogger.getEvents({ success: false });
        expect(events.length).toBe(1);
        expect(events[0].success).toBe(false);
      });

      it("filters by time", () => {
        const now = Date.now();
        const events = securityLogger.getEvents({ since: now - 1000 });
        expect(events.length).toBe(3);  // All recent

        const future = securityLogger.getEvents({ since: now + 1000 });
        expect(future.length).toBe(0);  // None in future
      });

      it("limits results", () => {
        const events = securityLogger.getEvents({ limit: 2 });
        expect(events.length).toBe(2);
      });
    });

    describe("getStats", () => {
      beforeEach(() => {
        securityLogger.log({
          type: "auth",
          severity: "critical",
          action: "breach",
          success: false,
          details: {},
        });
        securityLogger.log({
          type: "auth",
          severity: "low",
          action: "login",
          success: true,
          details: {},
        });
        securityLogger.log({
          type: "tool",
          severity: "medium",
          action: "exec",
          success: true,
          details: {},
        });
      });

      it("counts events by type", () => {
        const stats = securityLogger.getStats();
        expect(stats.auth).toBe(2);
        expect(stats.tool).toBe(1);
      });

      it("counts events by severity", () => {
        const stats = securityLogger.getStats();
        expect(stats.critical).toBe(1);
        expect(stats.low).toBe(1);
        expect(stats.medium).toBe(1);
      });

      it("counts success/failure", () => {
        const stats = securityLogger.getStats();
        expect(stats.success).toBe(2);
        expect(stats.failure).toBe(1);
      });

      it("counts total", () => {
        const stats = securityLogger.getStats();
        expect(stats.total).toBe(3);
      });
    });

    describe("convenience functions", () => {
      it("logAuthEvent", () => {
        logAuthEvent("login", true, { user: "alice" });
        
        const events = securityLogger.getEvents({ type: "auth" });
        expect(events.length).toBe(1);
        expect(events[0].action).toBe("login");
      });

      it("logToolEvent", () => {
        logToolEvent("exec", true, { command: "ls" });
        
        const events = securityLogger.getEvents({ type: "tool" });
        expect(events.length).toBe(1);
        expect(events[0].action).toBe("tool.exec");
      });
    });
  });
});
