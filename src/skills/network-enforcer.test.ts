/**
 * Tests for Network Enforcer
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  NetworkEnforcer,
  NetworkPolicyViolation,
} from "./network-enforcer.js";
import { NetworkPolicyManager, type NetworkPolicy } from "./network-policy.js";
import { rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("NetworkEnforcer", () => {
  let enforcer: NetworkEnforcer;
  let manager: NetworkPolicyManager;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `network-enforcer-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    manager = new NetworkPolicyManager(testDir);
    enforcer = new NetworkEnforcer(manager);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("enforce", () => {
    it("should allow request when policy allows", async () => {
      await manager.setPolicy({
        skillId: "weather",
        mode: "allowlist",
        allow: ["api.weather.com"],
        block: [],
        enabled: true,
      });

      await expect(
        enforcer.enforce("weather", "https://api.weather.com/data")
      ).resolves.not.toThrow();
    });

    it("should throw NetworkPolicyViolation when blocked", async () => {
      await manager.setPolicy({
        skillId: "weather",
        mode: "allowlist",
        allow: ["api.weather.com"],
        block: [],
        enabled: true,
      });

      await expect(enforcer.enforce("weather", "https://evil.com")).rejects.toThrow(
        NetworkPolicyViolation
      );
    });

    it("should allow all when no policy exists", async () => {
      await expect(
        enforcer.enforce("unknown-skill", "https://anywhere.com")
      ).resolves.not.toThrow();
    });

    it("should include reason in violation", async () => {
      await manager.setPolicy({
        skillId: "test",
        mode: "allowlist",
        allow: ["api.example.com"],
        block: [],
        enabled: true,
      });

      try {
        await enforcer.enforce("test", "https://evil.com");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(NetworkPolicyViolation);
        expect((err as NetworkPolicyViolation).reason).toContain("not in allowlist");
      }
    });
  });

  describe("check", () => {
    it("should return result without throwing", async () => {
      await manager.setPolicy({
        skillId: "weather",
        mode: "allowlist",
        allow: ["api.weather.com"],
        block: [],
        enabled: true,
      });

      const result = await enforcer.check("weather", "https://evil.com");

      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it("should match enforce behavior", async () => {
      await manager.setPolicy({
        skillId: "test",
        mode: "allowlist",
        allow: ["allowed.com"],
        block: [],
        enabled: true,
      });

      // Allowed URL
      const allowedCheck = await enforcer.check("test", "https://allowed.com");
      await expect(enforcer.enforce("test", "https://allowed.com")).resolves.not.toThrow();
      expect(allowedCheck.allowed).toBe(true);

      // Blocked URL
      const blockedCheck = await enforcer.check("test", "https://blocked.com");
      await expect(enforcer.enforce("test", "https://blocked.com")).rejects.toThrow();
      expect(blockedCheck.allowed).toBe(false);
    });
  });

  describe("audit logging", () => {
    it("should log allowed requests", async () => {
      await manager.setPolicy({
        skillId: "weather",
        mode: "allowlist",
        allow: ["api.weather.com"],
        block: [],
        enabled: true,
      });

      await enforcer.enforce("weather", "https://api.weather.com/data", "GET");

      const requests = await enforcer.getRecentRequests(10);

      expect(requests.length).toBeGreaterThan(0);
      expect(requests[requests.length - 1].skillId).toBe("weather");
      expect(requests[requests.length - 1].allowed).toBe(true);
    });

    it("should log blocked requests", async () => {
      await manager.setPolicy({
        skillId: "test",
        mode: "allowlist",
        allow: ["allowed.com"],
        block: [],
        enabled: true,
      });

      try {
        await enforcer.enforce("test", "https://blocked.com");
      } catch (err) {
        // Expected
      }

      const requests = await enforcer.getRecentRequests(10);

      expect(requests.length).toBeGreaterThan(0);
      expect(requests[requests.length - 1].allowed).toBe(false);
      expect(requests[requests.length - 1].reason).toBeDefined();
    });

    it("should include request details", async () => {
      await enforcer.enforce("skill1", "https://api.example.com", "POST");

      const requests = await enforcer.getRecentRequests(10);
      const latest = requests[requests.length - 1];

      expect(latest.skillId).toBe("skill1");
      expect(latest.url).toBe("https://api.example.com");
      expect(latest.method).toBe("POST");
      expect(latest.timestamp).toBeDefined();
    });
  });

  describe("getViolations", () => {
    it("should return only blocked requests", async () => {
      await manager.setPolicy({
        skillId: "test",
        mode: "allowlist",
        allow: ["allowed.com"],
        block: [],
        enabled: true,
      });

      // Allowed
      await enforcer.enforce("test", "https://allowed.com");

      // Blocked
      try {
        await enforcer.enforce("test", "https://blocked.com");
      } catch (err) {
        // Expected
      }

      const violations = await enforcer.getViolations(10);

      expect(violations.every((v) => !v.allowed)).toBe(true);
    });
  });

  describe("getStats", () => {
    it("should return statistics", async () => {
      await manager.setPolicy({
        skillId: "test",
        mode: "allowlist",
        allow: ["allowed.com"],
        block: [],
        enabled: true,
      });

      // Allowed
      await enforcer.enforce("test", "https://allowed.com");

      // Blocked
      try {
        await enforcer.enforce("test", "https://blocked.com");
      } catch (err) {
        // Expected
      }

      const stats = await enforcer.getStats();

      expect(stats.total).toBe(2);
      expect(stats.allowed).toBe(1);
      expect(stats.blocked).toBe(1);
      expect(stats.bySkill["test"]).toBeDefined();
      expect(stats.bySkill["test"].allowed).toBe(1);
      expect(stats.bySkill["test"].blocked).toBe(1);
    });

    it("should group by skill", async () => {
      await enforcer.enforce("skill1", "https://api1.com");
      await enforcer.enforce("skill2", "https://api2.com");
      await enforcer.enforce("skill1", "https://api3.com");

      const stats = await enforcer.getStats();

      expect(stats.bySkill["skill1"].allowed).toBe(2);
      expect(stats.bySkill["skill2"].allowed).toBe(1);
    });
  });

  describe("edge cases", () => {
    it("should handle DNS resolution failure gracefully", async () => {
      await manager.setPolicy({
        skillId: "test",
        mode: "allowlist",
        allow: ["*"],
        block: [],
        enabled: true,
      });

      // Non-existent domain (DNS will fail)
      await expect(
        enforcer.enforce("test", "https://this-domain-definitely-does-not-exist-12345.com")
      ).resolves.not.toThrow();
    });
  });
});

describe("NetworkPolicyViolation", () => {
  it("should create violation error", () => {
    const error = new NetworkPolicyViolation(
      "Test violation",
      "skill1",
      "https://evil.com",
      "Blocked by policy"
    );

    expect(error.name).toBe("NetworkPolicyViolation");
    expect(error.message).toBe("Test violation");
    expect(error.skillId).toBe("skill1");
    expect(error.url).toBe("https://evil.com");
    expect(error.reason).toBe("Blocked by policy");
  });

  it("should be instanceof Error", () => {
    const error = new NetworkPolicyViolation("Test", "skill1", "url", "reason");

    expect(error).toBeInstanceOf(Error);
  });
});
