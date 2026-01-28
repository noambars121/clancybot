/**
 * Tests for canary token system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  CanaryTokenManager,
  DEFAULT_CANARY_CONFIG,
  generateQuickCanary,
  type CanaryConfig,
} from "./canary-tokens.js";
import { writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("CanaryTokenManager", () => {
  let manager: CanaryTokenManager;
  let config: CanaryConfig;
  let testDir: string;

  beforeEach(async () => {
    config = {
      ...DEFAULT_CANARY_CONFIG,
      enabled: true,
      serviceUrl: "http://localhost:19999",
    };
    manager = new CanaryTokenManager(config);

    // Create temp directory
    testDir = join(tmpdir(), `canary-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    manager.stopMonitoring();
    await rm(testDir, { recursive: true, force: true });
  });

  describe("generateCanary", () => {
    it("should generate API key canary", () => {
      const canary = manager.generateCanary("api_key");

      expect(canary.id).toBeTruthy();
      expect(canary.type).toBe("api_key");
      expect(canary.value).toMatch(/^sk-canary-[a-f0-9]+$/);
      expect(canary.triggerUrl).toContain(canary.id);
      expect(canary.created).toBeGreaterThan(0);
      expect(canary.description).toContain("API key");
    });

    it("should generate token canary", () => {
      const canary = manager.generateCanary("token");

      expect(canary.type).toBe("token");
      expect(canary.value).toMatch(/^eyJ/); // JWT-like
      expect(canary.description).toContain("token");
    });

    it("should generate credential canary", () => {
      const canary = manager.generateCanary("credential");

      expect(canary.type).toBe("credential");
      expect(canary.value).toContain(":");
      expect(canary.value).toMatch(/canary_[a-f0-9]+/);
    });

    it("should generate webhook canary", () => {
      const canary = manager.generateCanary("webhook");

      expect(canary.type).toBe("webhook");
      expect(canary.value).toContain("/webhook/");
      expect(canary.value).toContain(config.serviceUrl);
    });

    it("should generate URL canary", () => {
      const canary = manager.generateCanary("url");

      expect(canary.type).toBe("url");
      expect(canary.value).toContain("/api/");
      expect(canary.value).toContain(config.serviceUrl);
    });

    it("should support custom description", () => {
      const canary = manager.generateCanary("api_key", "Custom test key");

      expect(canary.description).toBe("Custom test key");
    });

    it("should generate unique IDs", () => {
      const canary1 = manager.generateCanary("api_key");
      const canary2 = manager.generateCanary("api_key");

      expect(canary1.id).not.toBe(canary2.id);
      expect(canary1.value).not.toBe(canary2.value);
    });
  });

  describe("injectCanaries", () => {
    it("should inject canaries into content", () => {
      const originalContent = "# Memory\n\nSome user data here.";

      const injected = manager.injectCanaries(originalContent);

      expect(injected).toContain(originalContent);
      expect(injected).toContain("Legacy Configuration (Archive)");
      expect(injected).toContain("OPENAI_LEGACY_KEY");
      expect(injected).toContain("LEGACY_WEBHOOK");
      expect(injected).toContain("LEGACY_SERVICE_AUTH");
      expect(injected).toMatch(/sk-canary-[a-f0-9]+/);
    });

    it("should not inject if autoInject is false", () => {
      const noAutoConfig = { ...config, autoInject: false };
      const noAutoManager = new CanaryTokenManager(noAutoConfig);

      const content = "# Memory";
      const result = noAutoManager.injectCanaries(content);

      expect(result).toBe(content);
    });

    it("should generate canaries when injecting", () => {
      const content = "# Memory";

      expect(manager.getTokens()).toHaveLength(0);

      manager.injectCanaries(content);

      expect(manager.getTokens().length).toBeGreaterThan(0);
    });
  });

  describe("injectIntoFile", () => {
    it("should inject canaries into file", async () => {
      const filePath = join(testDir, "memory.md");
      await writeFile(filePath, "# Memory\n\nOriginal content", "utf8");

      await manager.injectIntoFile(filePath);

      const { readFile } = await import("node:fs/promises");
      const content = await readFile(filePath, "utf8");

      expect(content).toContain("Original content");
      expect(content).toContain("Legacy Configuration (Archive)");
      expect(content).toMatch(/sk-canary-/);
    });

    it("should not inject twice", async () => {
      const filePath = join(testDir, "memory.md");
      await writeFile(filePath, "# Memory", "utf8");

      await manager.injectIntoFile(filePath);
      const tokens1 = manager.getTokens().length;

      await manager.injectIntoFile(filePath);
      const tokens2 = manager.getTokens().length;

      expect(tokens2).toBe(tokens1); // Same count (no duplicates)

      const { readFile } = await import("node:fs/promises");
      const content = await readFile(filePath, "utf8");
      const matches = content.match(/Legacy Configuration \(Archive\)/g);
      expect(matches).toHaveLength(1); // Only one injection section
    });

    it("should throw on non-existent file", async () => {
      await expect(manager.injectIntoFile("/nonexistent/file.md")).rejects.toThrow();
    });
  });

  describe("checkCanaries", () => {
    it("should return empty array if disabled", async () => {
      const disabledConfig = { ...config, enabled: false };
      const disabledManager = new CanaryTokenManager(disabledConfig);

      const alerts = await disabledManager.checkCanaries();

      expect(alerts).toEqual([]);
    });

    it("should detect triggered canaries", async () => {
      const canary = manager.generateCanary("api_key");

      // Mock fetch to simulate triggered canary
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          triggered: true,
          accesses: [
            {
              timestamp: Date.now(),
              ip: "203.0.113.5",
              userAgent: "curl/7.68.0",
              method: "GET",
            },
          ],
        }),
      });

      const alerts = await manager.checkCanaries();

      expect(alerts).toHaveLength(1);
      expect(alerts[0].canaryId).toBe(canary.id);
      expect(alerts[0].type).toBe("api_key");
      expect(alerts[0].severity).toBe("critical");
      expect(alerts[0].source).toBe("203.0.113.5");
      expect(alerts[0].message).toContain("SECURITY BREACH");
      expect(alerts[0].recommendation).toContain("Rotate ALL credentials");
    });

    it("should handle fetch errors gracefully", async () => {
      manager.generateCanary("api_key");

      // Mock fetch to fail
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const alerts = await manager.checkCanaries();

      expect(alerts).toEqual([]); // No alerts on error (logged as warning)
    });

    it("should not alert on same access twice", async () => {
      const canary = manager.generateCanary("api_key");

      const access = {
        timestamp: Date.now(),
        ip: "203.0.113.5",
        userAgent: "curl/7.68.0",
      };

      // Mock: first check finds access
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          triggered: true,
          accesses: [access],
        }),
      });

      const alerts1 = await manager.checkCanaries();
      expect(alerts1).toHaveLength(1);

      // Second check: same access (should not alert again)
      const alerts2 = await manager.checkCanaries();
      expect(alerts2).toHaveLength(0);
    });
  });

  describe("monitoring", () => {
    it("should start monitoring", () => {
      expect(manager["checkInterval"]).toBeUndefined();

      manager.startMonitoring();

      expect(manager["checkInterval"]).toBeDefined();
    });

    it("should stop monitoring", () => {
      manager.startMonitoring();
      expect(manager["checkInterval"]).toBeDefined();

      manager.stopMonitoring();

      expect(manager["checkInterval"]).toBeUndefined();
    });

    it("should not start monitoring twice", () => {
      manager.startMonitoring();
      const interval1 = manager["checkInterval"];

      manager.startMonitoring();
      const interval2 = manager["checkInterval"];

      expect(interval1).toBe(interval2);
    });
  });

  describe("token management", () => {
    it("should get all tokens", () => {
      manager.generateCanary("api_key");
      manager.generateCanary("webhook");

      const tokens = manager.getTokens();

      expect(tokens).toHaveLength(2);
      expect(tokens[0].type).toBe("api_key");
      expect(tokens[1].type).toBe("webhook");
    });

    it("should get token by ID", () => {
      const canary = manager.generateCanary("api_key");

      const found = manager.getToken(canary.id);

      expect(found).toEqual(canary);
    });

    it("should return undefined for unknown ID", () => {
      const found = manager.getToken("unknown-id");

      expect(found).toBeUndefined();
    });

    it("should remove token", () => {
      const canary = manager.generateCanary("api_key");

      const removed = manager.removeToken(canary.id);

      expect(removed).toBe(true);
      expect(manager.getToken(canary.id)).toBeUndefined();
    });

    it("should return false when removing unknown token", () => {
      const removed = manager.removeToken("unknown-id");

      expect(removed).toBe(false);
    });

    it("should clear all tokens", () => {
      manager.generateCanary("api_key");
      manager.generateCanary("webhook");

      expect(manager.getTokens()).toHaveLength(2);

      manager.clear();

      expect(manager.getTokens()).toHaveLength(0);
    });
  });

  describe("persistence", () => {
    it("should save tokens to disk", async () => {
      manager.generateCanary("api_key");
      manager.generateCanary("webhook");

      const savePath = join(testDir, "canaries.json");
      await manager.save(savePath);

      const { readFile } = await import("node:fs/promises");
      const content = await readFile(savePath, "utf8");
      const data = JSON.parse(content);

      expect(data.version).toBe("1.0");
      expect(data.tokens).toHaveLength(2);
      expect(data.tokens[0].type).toBe("api_key");
    });

    it("should load tokens from disk", async () => {
      // Save first
      manager.generateCanary("api_key");
      const savePath = join(testDir, "canaries.json");
      await manager.save(savePath);

      // Create new manager and load
      const newManager = new CanaryTokenManager(config);
      await newManager.load(savePath);

      const tokens = newManager.getTokens();
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe("api_key");
    });

    it("should handle missing file gracefully", async () => {
      const loadPath = join(testDir, "nonexistent.json");

      await expect(manager.load(loadPath)).resolves.not.toThrow();

      expect(manager.getTokens()).toHaveLength(0);
    });
  });
});

describe("generateQuickCanary", () => {
  it("should generate quick canary with default type", () => {
    const value = generateQuickCanary();

    expect(value).toMatch(/^sk-canary-[a-f0-9]+$/);
  });

  it("should generate quick canary with custom type", () => {
    const value = generateQuickCanary("webhook");

    expect(value).toContain("/webhook/");
  });
});
