/**
 * Tests for canary monitoring service
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CanaryService, DEFAULT_CANARY_SERVICE_CONFIG } from "./canary-service.js";
import type { CanaryServiceConfig } from "./canary-service.js";

describe("CanaryService", () => {
  let service: CanaryService;
  let config: CanaryServiceConfig;

  beforeEach(() => {
    config = {
      ...DEFAULT_CANARY_SERVICE_CONFIG,
      port: 19998, // Different port for testing
      enabled: true,
    };
    service = new CanaryService(config);
  });

  afterEach(async () => {
    await service.stop();
  });

  describe("service lifecycle", () => {
    it("should start service", async () => {
      expect(service.isRunning()).toBe(false);

      await service.start();

      expect(service.isRunning()).toBe(true);
    });

    it("should stop service", async () => {
      await service.start();
      expect(service.isRunning()).toBe(true);

      await service.stop();

      expect(service.isRunning()).toBe(false);
    });

    it("should not start service twice", async () => {
      await service.start();

      await expect(service.start()).rejects.toThrow("already running");
    });

    it("should handle stop when not running", async () => {
      await expect(service.stop()).resolves.not.toThrow();
    });
  });

  describe("alert handling", () => {
    beforeEach(async () => {
      await service.start();
    });

    it("should handle alert endpoint", async () => {
      const canaryId = "test-canary-123";
      const response = await fetch(`http://127.0.0.1:${config.port}/alert/${canaryId}`);

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.status).toBe("ok");
      expect(data.data).toBeDefined();
    });

    it("should log canary access", async () => {
      const canaryId = "test-canary-456";

      await fetch(`http://127.0.0.1:${config.port}/alert/${canaryId}`, {
        headers: { "User-Agent": "test-agent" },
      });

      const logs = service.getCanaryLogs(canaryId);

      expect(logs).toHaveLength(1);
      expect(logs[0].ip).toBeTruthy();
      expect(logs[0].userAgent).toBe("test-agent");
      expect(logs[0].timestamp).toBeGreaterThan(0);
    });

    it("should handle webhook endpoint", async () => {
      const canaryId = "webhook-canary-789";
      const response = await fetch(`http://127.0.0.1:${config.port}/webhook/${canaryId}`, {
        method: "POST",
      });

      expect(response.ok).toBe(true);

      const logs = service.getCanaryLogs(canaryId);
      expect(logs).toHaveLength(1);
      expect(logs[0].method).toBe("POST");
    });

    it("should handle API endpoint", async () => {
      const canaryId = "api-canary-abc";
      const response = await fetch(`http://127.0.0.1:${config.port}/api/${canaryId}/data`);

      expect(response.ok).toBe(true);

      const logs = service.getCanaryLogs(canaryId);
      expect(logs).toHaveLength(1);
    });

    it("should track multiple accesses", async () => {
      const canaryId = "multi-access";

      await fetch(`http://127.0.0.1:${config.port}/alert/${canaryId}`);
      await fetch(`http://127.0.0.1:${config.port}/alert/${canaryId}`);
      await fetch(`http://127.0.0.1:${config.port}/alert/${canaryId}`);

      const logs = service.getCanaryLogs(canaryId);
      expect(logs).toHaveLength(3);
    });

    it("should extract client IP from X-Forwarded-For", async () => {
      const canaryId = "forwarded-ip";

      await fetch(`http://127.0.0.1:${config.port}/alert/${canaryId}`, {
        headers: { "X-Forwarded-For": "203.0.113.5, 192.168.1.1" },
      });

      const logs = service.getCanaryLogs(canaryId);
      expect(logs[0].ip).toBe("203.0.113.5");
    });

    it("should extract client IP from X-Real-IP", async () => {
      const canaryId = "real-ip";

      await fetch(`http://127.0.0.1:${config.port}/alert/${canaryId}`, {
        headers: { "X-Real-IP": "198.51.100.10" },
      });

      const logs = service.getCanaryLogs(canaryId);
      expect(logs[0].ip).toBe("198.51.100.10");
    });
  });

  describe("status endpoint", () => {
    beforeEach(async () => {
      await service.start();
    });

    it("should return status for untriggered canary", async () => {
      const canaryId = "status-test-1";

      const response = await fetch(`http://127.0.0.1:${config.port}/status/${canaryId}`);
      const data = await response.json();

      expect(data.canaryId).toBe(canaryId);
      expect(data.triggered).toBe(false);
      expect(data.accesses).toEqual([]);
      expect(data.count).toBe(0);
    });

    it("should return status for triggered canary", async () => {
      const canaryId = "status-test-2";

      // Trigger canary
      await fetch(`http://127.0.0.1:${config.port}/alert/${canaryId}`);

      // Check status
      const response = await fetch(`http://127.0.0.1:${config.port}/status/${canaryId}`);
      const data = await response.json();

      expect(data.triggered).toBe(true);
      expect(data.count).toBe(1);
      expect(data.accesses).toHaveLength(1);
    });
  });

  describe("health check", () => {
    beforeEach(async () => {
      await service.start();
    });

    it("should respond to health check", async () => {
      const response = await fetch(`http://127.0.0.1:${config.port}/health`);
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.status).toBe("ok");
      expect(data.service).toBe("canary");
    });
  });

  describe("unknown endpoints", () => {
    beforeEach(async () => {
      await service.start();
    });

    it("should return 404 for unknown endpoint", async () => {
      const response = await fetch(`http://127.0.0.1:${config.port}/unknown`);

      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toBe("Not found");
    });
  });

  describe("log management", () => {
    beforeEach(async () => {
      await service.start();
    });

    it("should get all access logs", async () => {
      await fetch(`http://127.0.0.1:${config.port}/alert/canary-1`);
      await fetch(`http://127.0.0.1:${config.port}/alert/canary-2`);

      const allLogs = service.getAccessLogs();

      expect(allLogs.size).toBe(2);
      expect(allLogs.has("canary-1")).toBe(true);
      expect(allLogs.has("canary-2")).toBe(true);
    });

    it("should get logs for specific canary", async () => {
      await fetch(`http://127.0.0.1:${config.port}/alert/specific-canary`);
      await fetch(`http://127.0.0.1:${config.port}/alert/specific-canary`);

      const logs = service.getCanaryLogs("specific-canary");

      expect(logs).toHaveLength(2);
    });

    it("should return empty array for unknown canary", () => {
      const logs = service.getCanaryLogs("unknown-canary");

      expect(logs).toEqual([]);
    });

    it("should clear all logs", async () => {
      await fetch(`http://127.0.0.1:${config.port}/alert/canary-1`);
      await fetch(`http://127.0.0.1:${config.port}/alert/canary-2`);

      expect(service.getAccessLogs().size).toBe(2);

      service.clearLogs();

      expect(service.getAccessLogs().size).toBe(0);
    });
  });

  describe("fake response generation", () => {
    beforeEach(async () => {
      await service.start();
    });

    it("should return realistic fake data", async () => {
      const response = await fetch(`http://127.0.0.1:${config.port}/alert/fake-data-test`);
      const data = await response.json();

      expect(data.status).toBe("ok");
      expect(data.data).toBeDefined();
      expect(data.data.message).toContain("processed successfully");
      expect(data.data.result).toBeDefined();
      expect(data.data.result.success).toBe(true);
      expect(data.data.result.items).toHaveLength(2);
    });

    it("should include timestamp in response", async () => {
      const response = await fetch(`http://127.0.0.1:${config.port}/alert/timestamp-test`);
      const data = await response.json();

      expect(data.data.timestamp).toBeTruthy();
      expect(new Date(data.data.timestamp).getTime()).toBeGreaterThan(0);
    });
  });
});
