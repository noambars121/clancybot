/**
 * Tests for trust store
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TrustStore, clearDefaultTrustStore, getDefaultTrustStore } from "./trust-store.js";
import { TrustLevel, generateKeyPair } from "./signing.js";
import { rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";

describe("TrustStore", () => {
  let store: TrustStore;
  let testDir: string;
  let storePath: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `trust-store-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    storePath = join(testDir, "trust-store.json");

    store = new TrustStore(storePath);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    clearDefaultTrustStore();
  });

  describe("initialization", () => {
    it("should initialize with default developers", async () => {
      await store.load();

      const developers = store.getAllDevelopers();
      expect(developers.length).toBeGreaterThan(0);

      // Should have official Moltbot team
      const official = store.getDevelopersByLevel(TrustLevel.OFFICIAL);
      expect(official.length).toBeGreaterThan(0);
    });

    it("should create store file on first load", async () => {
      expect(existsSync(storePath)).toBe(false);

      await store.load();

      expect(existsSync(storePath)).toBe(true);
    });
  });

  describe("addDeveloper", () => {
    it("should add developer", () => {
      const keyPair = generateKeyPair();
      const dev = {
        fingerprint: keyPair.fingerprint,
        name: "Test Developer",
        email: "test@example.com",
        level: TrustLevel.COMMUNITY,
        publicKey: keyPair.publicKey,
        addedAt: new Date().toISOString(),
      };

      store.addDeveloper(dev);

      const retrieved = store.getDeveloper(keyPair.fingerprint);
      expect(retrieved).toEqual(dev);
    });

    it("should throw on mismatched fingerprint", () => {
      const keyPair = generateKeyPair();
      const dev = {
        fingerprint: "wrong-fingerprint",
        name: "Test",
        level: TrustLevel.COMMUNITY,
        publicKey: keyPair.publicKey,
        addedAt: new Date().toISOString(),
      };

      expect(() => store.addDeveloper(dev)).toThrow("Fingerprint does not match");
    });
  });

  describe("removeDeveloper", () => {
    it("should remove developer", () => {
      const keyPair = generateKeyPair();
      const dev = {
        fingerprint: keyPair.fingerprint,
        name: "Test",
        level: TrustLevel.COMMUNITY,
        publicKey: keyPair.publicKey,
        addedAt: new Date().toISOString(),
      };

      store.addDeveloper(dev);
      expect(store.isTrusted(keyPair.fingerprint)).toBe(true);

      const removed = store.removeDeveloper(keyPair.fingerprint);

      expect(removed).toBe(true);
      expect(store.isTrusted(keyPair.fingerprint)).toBe(false);
    });

    it("should return false when removing unknown developer", () => {
      const removed = store.removeDeveloper("unknown-fingerprint");

      expect(removed).toBe(false);
    });
  });

  describe("getDeveloper", () => {
    it("should get developer by fingerprint", () => {
      const keyPair = generateKeyPair();
      const dev = {
        fingerprint: keyPair.fingerprint,
        name: "Test",
        level: TrustLevel.VERIFIED,
        publicKey: keyPair.publicKey,
        addedAt: new Date().toISOString(),
      };

      store.addDeveloper(dev);

      const retrieved = store.getDeveloper(keyPair.fingerprint);

      expect(retrieved).toEqual(dev);
    });

    it("should return undefined for unknown fingerprint", () => {
      const retrieved = store.getDeveloper("unknown");

      expect(retrieved).toBeUndefined();
    });
  });

  describe("getDevelopersByLevel", () => {
    beforeEach(async () => {
      await store.load();
    });

    it("should get developers by trust level", () => {
      const key1 = generateKeyPair();
      const key2 = generateKeyPair();
      const key3 = generateKeyPair();

      store.addDeveloper({
        fingerprint: key1.fingerprint,
        name: "Official",
        level: TrustLevel.OFFICIAL,
        publicKey: key1.publicKey,
        addedAt: new Date().toISOString(),
      });

      store.addDeveloper({
        fingerprint: key2.fingerprint,
        name: "Verified 1",
        level: TrustLevel.VERIFIED,
        publicKey: key2.publicKey,
        addedAt: new Date().toISOString(),
      });

      store.addDeveloper({
        fingerprint: key3.fingerprint,
        name: "Verified 2",
        level: TrustLevel.VERIFIED,
        publicKey: key3.publicKey,
        addedAt: new Date().toISOString(),
      });

      const verified = store.getDevelopersByLevel(TrustLevel.VERIFIED);

      expect(verified).toHaveLength(2);
      expect(verified[0].name).toContain("Verified");
    });
  });

  describe("getAllPublicKeys", () => {
    it("should get all public keys", () => {
      const key1 = generateKeyPair();
      const key2 = generateKeyPair();

      store.addDeveloper({
        fingerprint: key1.fingerprint,
        name: "Dev 1",
        level: TrustLevel.COMMUNITY,
        publicKey: key1.publicKey,
        addedAt: new Date().toISOString(),
      });

      store.addDeveloper({
        fingerprint: key2.fingerprint,
        name: "Dev 2",
        level: TrustLevel.COMMUNITY,
        publicKey: key2.publicKey,
        addedAt: new Date().toISOString(),
      });

      const keys = store.getAllPublicKeys();

      expect(keys).toHaveLength(2);
      expect(keys).toContain(key1.publicKey);
      expect(keys).toContain(key2.publicKey);
    });
  });

  describe("isTrusted", () => {
    it("should return true for trusted developer", () => {
      const keyPair = generateKeyPair();

      store.addDeveloper({
        fingerprint: keyPair.fingerprint,
        name: "Test",
        level: TrustLevel.VERIFIED,
        publicKey: keyPair.publicKey,
        addedAt: new Date().toISOString(),
      });

      expect(store.isTrusted(keyPair.fingerprint)).toBe(true);
    });

    it("should return false for unknown developer", () => {
      expect(store.isTrusted("unknown")).toBe(false);
    });
  });

  describe("getTrustLevel", () => {
    it("should return trust level for developer", () => {
      const keyPair = generateKeyPair();

      store.addDeveloper({
        fingerprint: keyPair.fingerprint,
        name: "Test",
        level: TrustLevel.VERIFIED,
        publicKey: keyPair.publicKey,
        addedAt: new Date().toISOString(),
      });

      const level = store.getTrustLevel(keyPair.fingerprint);

      expect(level).toBe(TrustLevel.VERIFIED);
    });

    it("should return UNSIGNED for unknown developer", () => {
      const level = store.getTrustLevel("unknown");

      expect(level).toBe(TrustLevel.UNSIGNED);
    });
  });

  describe("updateTrustLevel", () => {
    it("should update trust level", () => {
      const keyPair = generateKeyPair();

      store.addDeveloper({
        fingerprint: keyPair.fingerprint,
        name: "Test",
        level: TrustLevel.COMMUNITY,
        publicKey: keyPair.publicKey,
        addedAt: new Date().toISOString(),
      });

      expect(store.getTrustLevel(keyPair.fingerprint)).toBe(TrustLevel.COMMUNITY);

      store.updateTrustLevel(keyPair.fingerprint, TrustLevel.VERIFIED);

      expect(store.getTrustLevel(keyPair.fingerprint)).toBe(TrustLevel.VERIFIED);
    });

    it("should throw on unknown developer", () => {
      expect(() => store.updateTrustLevel("unknown", TrustLevel.VERIFIED)).toThrow();
    });
  });

  describe("importDeveloper", () => {
    it("should import developer from public key", async () => {
      const keyPair = generateKeyPair();

      const dev = await store.importDeveloper(
        keyPair.publicKey,
        "Imported Dev",
        TrustLevel.COMMUNITY,
        "dev@example.com"
      );

      expect(dev.fingerprint).toBe(keyPair.fingerprint);
      expect(dev.name).toBe("Imported Dev");
      expect(dev.level).toBe(TrustLevel.COMMUNITY);
      expect(dev.email).toBe("dev@example.com");

      expect(store.isTrusted(keyPair.fingerprint)).toBe(true);
    });

    it("should throw if developer already exists", async () => {
      const keyPair = generateKeyPair();

      await store.importDeveloper(keyPair.publicKey, "Dev 1", TrustLevel.COMMUNITY);

      await expect(store.importDeveloper(keyPair.publicKey, "Dev 2", TrustLevel.COMMUNITY)).rejects.toThrow(
        "already exists"
      );
    });
  });

  describe("exportPublicKey", () => {
    it("should export public key", () => {
      const keyPair = generateKeyPair();

      store.addDeveloper({
        fingerprint: keyPair.fingerprint,
        name: "Test",
        level: TrustLevel.VERIFIED,
        publicKey: keyPair.publicKey,
        addedAt: new Date().toISOString(),
      });

      const exported = store.exportPublicKey(keyPair.fingerprint);

      expect(exported).toBe(keyPair.publicKey);
    });

    it("should return undefined for unknown fingerprint", () => {
      const exported = store.exportPublicKey("unknown");

      expect(exported).toBeUndefined();
    });
  });

  describe("getStats", () => {
    beforeEach(async () => {
      await store.load();
    });

    it("should return statistics", () => {
      const key1 = generateKeyPair();
      const key2 = generateKeyPair();
      const key3 = generateKeyPair();

      store.addDeveloper({
        fingerprint: key1.fingerprint,
        name: "Official",
        level: TrustLevel.OFFICIAL,
        publicKey: key1.publicKey,
        addedAt: new Date().toISOString(),
      });

      store.addDeveloper({
        fingerprint: key2.fingerprint,
        name: "Verified",
        level: TrustLevel.VERIFIED,
        publicKey: key2.publicKey,
        addedAt: new Date().toISOString(),
      });

      store.addDeveloper({
        fingerprint: key3.fingerprint,
        name: "Community",
        level: TrustLevel.COMMUNITY,
        publicKey: key3.publicKey,
        addedAt: new Date().toISOString(),
      });

      const stats = store.getStats();

      expect(stats.total).toBeGreaterThanOrEqual(3);
      expect(stats.official).toBeGreaterThanOrEqual(1);
      expect(stats.verified).toBeGreaterThanOrEqual(1);
      expect(stats.community).toBeGreaterThanOrEqual(1);
    });
  });

  describe("search", () => {
    beforeEach(() => {
      const key1 = generateKeyPair();
      const key2 = generateKeyPair();
      const key3 = generateKeyPair();

      store.addDeveloper({
        fingerprint: key1.fingerprint,
        name: "John Doe",
        email: "john@example.com",
        level: TrustLevel.VERIFIED,
        publicKey: key1.publicKey,
        addedAt: new Date().toISOString(),
      });

      store.addDeveloper({
        fingerprint: key2.fingerprint,
        name: "Jane Smith",
        email: "jane@example.com",
        level: TrustLevel.COMMUNITY,
        publicKey: key2.publicKey,
        addedAt: new Date().toISOString(),
      });

      store.addDeveloper({
        fingerprint: key3.fingerprint,
        name: "Bob Johnson",
        email: "bob@other.com",
        level: TrustLevel.VERIFIED,
        publicKey: key3.publicKey,
        addedAt: new Date().toISOString(),
      });
    });

    it("should search by name", () => {
      const results = store.search("john");

      expect(results).toHaveLength(2); // John Doe, Bob Johnson
      expect(results.some((d) => d.name === "John Doe")).toBe(true);
      expect(results.some((d) => d.name === "Bob Johnson")).toBe(true);
    });

    it("should search by email", () => {
      const results = store.search("example.com");

      expect(results).toHaveLength(2); // john@example.com, jane@example.com
    });

    it("should be case-insensitive", () => {
      const results = store.search("JOHN");

      expect(results.length).toBeGreaterThan(0);
    });

    it("should return empty array for no matches", () => {
      const results = store.search("nonexistent");

      expect(results).toEqual([]);
    });
  });

  describe("persistence", () => {
    it("should save to disk", async () => {
      const keyPair = generateKeyPair();

      store.addDeveloper({
        fingerprint: keyPair.fingerprint,
        name: "Test",
        level: TrustLevel.VERIFIED,
        publicKey: keyPair.publicKey,
        addedAt: new Date().toISOString(),
      });

      await store.save();

      expect(existsSync(storePath)).toBe(true);
    });

    it("should load from disk", async () => {
      const keyPair = generateKeyPair();

      store.addDeveloper({
        fingerprint: keyPair.fingerprint,
        name: "Test",
        level: TrustLevel.VERIFIED,
        publicKey: keyPair.publicKey,
        addedAt: new Date().toISOString(),
      });

      await store.save();

      // Create new store instance and load
      const newStore = new TrustStore(storePath);
      await newStore.load();

      const dev = newStore.getDeveloper(keyPair.fingerprint);
      expect(dev).toBeDefined();
      expect(dev?.name).toBe("Test");
    });
  });
});

describe("getDefaultTrustStore", () => {
  afterEach(() => {
    clearDefaultTrustStore();
  });

  it("should return singleton instance", async () => {
    const store1 = await getDefaultTrustStore();
    const store2 = await getDefaultTrustStore();

    expect(store1).toBe(store2);
  });

  it("should auto-load on first access", async () => {
    const store = await getDefaultTrustStore();

    const developers = store.getAllDevelopers();
    expect(developers.length).toBeGreaterThan(0); // Has defaults
  });
});
