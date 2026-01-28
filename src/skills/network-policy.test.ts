/**
 * Tests for Network Policy
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  NetworkPolicyManager,
  POLICY_PRESETS,
  type NetworkPolicy,
} from "./network-policy.js";
import { rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("NetworkPolicyManager", () => {
  let manager: NetworkPolicyManager;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `network-policy-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    manager = new NetworkPolicyManager(testDir);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("setPolicy and getPolicy", () => {
    it("should set and retrieve policy", async () => {
      const policy: NetworkPolicy = {
        skillId: "weather",
        mode: "allowlist",
        allow: ["api.weather.com"],
        block: [],
        enabled: true,
      };

      await manager.setPolicy(policy);

      const retrieved = manager.getPolicy("weather");

      expect(retrieved).toEqual(policy);
    });

    it("should return undefined for unknown skill", () => {
      const policy = manager.getPolicy("unknown");

      expect(policy).toBeUndefined();
    });
  });

  describe("check - allowlist mode", () => {
    beforeEach(async () => {
      await manager.setPolicy({
        skillId: "weather",
        mode: "allowlist",
        allow: ["api.weather.com", "*.openweathermap.org"],
        block: [],
        enabled: true,
      });
    });

    it("should allow URLs in allowlist", async () => {
      const result = await manager.check("weather", "https://api.weather.com/data");

      expect(result.allowed).toBe(true);
    });

    it("should block URLs not in allowlist", async () => {
      const result = await manager.check("weather", "https://evil.com");

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not in allowlist");
    });

    it("should support wildcard patterns", async () => {
      const result = await manager.check(
        "weather",
        "https://api.openweathermap.org/data"
      );

      expect(result.allowed).toBe(true);
    });

    it("should respect blocklist even in allowlist mode", async () => {
      await manager.setPolicy({
        skillId: "test",
        mode: "allowlist",
        allow: ["*"],
        block: ["evil.com"],
        enabled: true,
      });

      const result = await manager.check("test", "https://evil.com");

      expect(result.allowed).toBe(false);
    });
  });

  describe("check - blocklist mode", () => {
    beforeEach(async () => {
      await manager.setPolicy({
        skillId: "admin",
        mode: "blocklist",
        allow: [],
        block: ["192.168.*.*", "10.*.*.*", "private"],
        enabled: true,
      });
    });

    it("should allow URLs not in blocklist", async () => {
      const result = await manager.check("admin", "https://api.example.com");

      expect(result.allowed).toBe(true);
    });

    it("should block URLs in blocklist", async () => {
      const result = await manager.check("admin", "http://192.168.1.1");

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("blocklist");
    });

    it("should block private IPs with 'private' pattern", async () => {
      const privateIPs = [
        "http://10.0.0.1",
        "http://172.16.0.1",
        "http://192.168.0.1",
        "http://127.0.0.1",
      ];

      for (const ip of privateIPs) {
        const result = await manager.check("admin", ip);
        expect(result.allowed).toBe(false);
      }
    });

    it("should block localhost with 'localhost' pattern", async () => {
      await manager.setPolicy({
        skillId: "test",
        mode: "blocklist",
        allow: [],
        block: ["localhost"],
        enabled: true,
      });

      const result = await manager.check("test", "http://localhost:3000");

      expect(result.allowed).toBe(false);
    });

    it("should block metadata server", async () => {
      await manager.setPolicy({
        skillId: "test",
        mode: "blocklist",
        allow: [],
        block: ["metadata"],
        enabled: true,
      });

      const result = await manager.check("test", "http://169.254.169.254/latest/meta-data");

      expect(result.allowed).toBe(false);
    });
  });

  describe("check - port restrictions", () => {
    it("should allow only specified ports", async () => {
      await manager.setPolicy({
        skillId: "web",
        mode: "allowlist",
        allow: ["*"],
        block: [],
        ports: {
          allow: [80, 443],
        },
        enabled: true,
      });

      const httpsResult = await manager.check("web", "https://api.example.com"); // port 443
      expect(httpsResult.allowed).toBe(true);

      const sshResult = await manager.check("web", "http://example.com:22");
      expect(sshResult.allowed).toBe(false);
    });

    it("should block specified ports", async () => {
      await manager.setPolicy({
        skillId: "safe",
        mode: "allowlist",
        allow: ["*"],
        block: [],
        ports: {
          block: [22, 3389], // SSH, RDP
        },
        enabled: true,
      });

      const sshResult = await manager.check("safe", "http://example.com:22");
      expect(sshResult.allowed).toBe(false);

      const httpsResult = await manager.check("safe", "https://example.com:443");
      expect(httpsResult.allowed).toBe(true);
    });

    it("should use default ports for protocol", async () => {
      await manager.setPolicy({
        skillId: "web",
        mode: "allowlist",
        allow: ["*"],
        block: [],
        ports: {
          allow: [443],
        },
        enabled: true,
      });

      // HTTPS defaults to 443
      const result = await manager.check("web", "https://api.example.com");

      expect(result.allowed).toBe(true);
    });
  });

  describe("check - protocol restrictions", () => {
    it("should allow only HTTPS", async () => {
      await manager.setPolicy({
        skillId: "secure",
        mode: "allowlist",
        allow: ["*"],
        block: [],
        protocols: {
          allow: ["https"],
        },
        enabled: true,
      });

      const httpsResult = await manager.check("secure", "https://api.example.com");
      expect(httpsResult.allowed).toBe(true);

      const httpResult = await manager.check("secure", "http://api.example.com");
      expect(httpResult.allowed).toBe(false);
    });

    it("should block insecure protocols", async () => {
      await manager.setPolicy({
        skillId: "safe",
        mode: "allowlist",
        allow: ["*"],
        block: [],
        protocols: {
          block: ["ftp", "telnet"],
        },
        enabled: true,
      });

      const ftpResult = await manager.check("safe", "ftp://files.example.com");
      expect(ftpResult.allowed).toBe(false);
    });
  });

  describe("policy presets", () => {
    it("should apply public-api preset", async () => {
      await manager.setPolicy({
        skillId: "weather",
        preset: "public-api",
        mode: "allowlist",
        allow: [],
        block: [],
        enabled: true,
      });

      const policy = manager.getPolicy("weather");

      expect(policy?.mode).toBe("allowlist");
      expect(policy?.protocols?.allow).toContain("https");
    });

    it("should apply internal-only preset", async () => {
      await manager.setPolicy({
        skillId: "admin",
        preset: "internal-only",
        mode: "allowlist",
        allow: [],
        block: [],
        enabled: true,
      });

      const policy = manager.getPolicy("admin");

      expect(policy?.allow).toContain("192.168.*.*");
    });

    it("should throw on unknown preset", async () => {
      await expect(
        manager.setPolicy({
          skillId: "test",
          preset: "unknown-preset",
          mode: "allowlist",
          allow: [],
          block: [],
          enabled: true,
        })
      ).rejects.toThrow("Unknown preset");
    });
  });

  describe("disabled policies", () => {
    it("should allow all when policy is disabled", async () => {
      await manager.setPolicy({
        skillId: "test",
        mode: "allowlist",
        allow: ["api.example.com"],
        block: [],
        enabled: false, // Disabled!
      });

      const result = await manager.check("test", "https://evil.com");

      expect(result.allowed).toBe(true);
    });
  });

  describe("no policy (default behavior)", () => {
    it("should allow all when no policy exists", async () => {
      const result = await manager.check("unknown-skill", "https://anywhere.com");

      expect(result.allowed).toBe(true);
    });
  });

  describe("wildcard matching", () => {
    it("should match wildcard subdomains", async () => {
      await manager.setPolicy({
        skillId: "api",
        mode: "allowlist",
        allow: ["*.example.com"],
        block: [],
        enabled: true,
      });

      const result1 = await manager.check("api", "https://api.example.com");
      expect(result1.allowed).toBe(true);

      const result2 = await manager.check("api", "https://data.example.com");
      expect(result2.allowed).toBe(true);

      const result3 = await manager.check("api", "https://example.com");
      expect(result3.allowed).toBe(false); // Doesn't match *.
    });

    it("should match IP wildcards", async () => {
      await manager.setPolicy({
        skillId: "local",
        mode: "allowlist",
        allow: ["192.168.1.*"],
        block: [],
        enabled: true,
      });

      const result1 = await manager.check("local", "http://192.168.1.1");
      expect(result1.allowed).toBe(true);

      const result2 = await manager.check("local", "http://192.168.1.255");
      expect(result2.allowed).toBe(true);

      const result3 = await manager.check("local", "http://192.168.2.1");
      expect(result3.allowed).toBe(false);
    });

    it("should match wildcard all (*)", async () => {
      await manager.setPolicy({
        skillId: "open",
        mode: "allowlist",
        allow: ["*"],
        block: [],
        enabled: true,
      });

      const result = await manager.check("open", "https://anything.com");

      expect(result.allowed).toBe(true);
    });
  });

  describe("persistence", () => {
    it("should save policies to disk", async () => {
      await manager.setPolicy({
        skillId: "test",
        mode: "allowlist",
        allow: ["api.example.com"],
        block: [],
        enabled: true,
      });

      // Create new manager instance
      const newManager = new NetworkPolicyManager(testDir);
      await newManager.load();

      const policy = newManager.getPolicy("test");

      expect(policy).toBeDefined();
      expect(policy?.allow).toContain("api.example.com");
    });
  });

  describe("getAllPolicies", () => {
    it("should return all policies", async () => {
      await manager.setPolicy({
        skillId: "skill1",
        mode: "allowlist",
        allow: [],
        block: [],
        enabled: true,
      });

      await manager.setPolicy({
        skillId: "skill2",
        mode: "blocklist",
        allow: [],
        block: [],
        enabled: true,
      });

      const all = manager.getAllPolicies();

      expect(all.length).toBe(2);
    });
  });

  describe("deletePolicy", () => {
    it("should delete policy", async () => {
      await manager.setPolicy({
        skillId: "test",
        mode: "allowlist",
        allow: [],
        block: [],
        enabled: true,
      });

      const deleted = await manager.deletePolicy("test");

      expect(deleted).toBe(true);
      expect(manager.getPolicy("test")).toBeUndefined();
    });

    it("should return false for unknown policy", async () => {
      const deleted = await manager.deletePolicy("unknown");

      expect(deleted).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should handle invalid URL", async () => {
      await manager.setPolicy({
        skillId: "test",
        mode: "allowlist",
        allow: ["*"],
        block: [],
        enabled: true,
      });

      const result = await manager.check("test", "not-a-url");

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Invalid URL");
    });
  });
});

describe("POLICY_PRESETS", () => {
  it("should have all required presets", () => {
    expect(POLICY_PRESETS["public-api"]).toBeDefined();
    expect(POLICY_PRESETS["internal-only"]).toBeDefined();
    expect(POLICY_PRESETS["no-network"]).toBeDefined();
    expect(POLICY_PRESETS["unrestricted"]).toBeDefined();
  });

  it("should have valid preset configurations", () => {
    for (const [name, preset] of Object.entries(POLICY_PRESETS)) {
      expect(preset.name).toBeTruthy();
      expect(preset.description).toBeTruthy();
      expect(preset.policy).toBeDefined();
      expect(preset.policy.mode).toMatch(/^(allowlist|blocklist)$/);
    }
  });

  describe("public-api preset", () => {
    it("should block private IPs", () => {
      const preset = POLICY_PRESETS["public-api"];

      expect(preset.policy.block).toContain("private");
      expect(preset.policy.block).toContain("localhost");
      expect(preset.policy.block).toContain("metadata");
    });

    it("should allow only HTTP/HTTPS", () => {
      const preset = POLICY_PRESETS["public-api"];

      expect(preset.policy.protocols?.allow).toContain("https");
    });
  });

  describe("internal-only preset", () => {
    it("should allow private IPs", () => {
      const preset = POLICY_PRESETS["internal-only"];

      expect(preset.policy.allow).toContain("192.168.*.*");
      expect(preset.policy.allow).toContain("10.*.*.*");
      expect(preset.policy.allow).toContain("localhost");
    });
  });

  describe("no-network preset", () => {
    it("should block everything", () => {
      const preset = POLICY_PRESETS["no-network"];

      expect(preset.policy.mode).toBe("blocklist");
      expect(preset.policy.block).toContain("*");
    });
  });
});
