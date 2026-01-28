/**
 * Tests for Memory Doctor
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryDoctor, type PurgeOptions } from "./memory-doctor.js";
import { writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("MemoryDoctor", () => {
  let doctor: MemoryDoctor;
  let testDir: string;
  let memoryDir: string;
  let logsDir: string;

  beforeEach(async () => {
    // Create temp directory structure
    testDir = join(tmpdir(), `memory-doctor-test-${Date.now()}`);
    memoryDir = join(testDir, "memory");
    logsDir = join(testDir, "agents");

    await mkdir(memoryDir, { recursive: true });
    await mkdir(logsDir, { recursive: true });

    doctor = new MemoryDoctor(testDir);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("scan - Markdown layer", () => {
    it("should find exact matches in Markdown files", async () => {
      // Create memory file with sensitive data
      const memoryFile = join(memoryDir, "MEMORY.md");
      await writeFile(
        memoryFile,
        "# Memory\n\nMy password is SuperSecret123!\n\nSome other content.",
        "utf8"
      );

      const matches = await doctor.scan("password");

      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some((m) => m.layer === "markdown")).toBe(true);
      expect(matches.some((m) => m.content.includes("password"))).toBe(true);
    });

    it("should be case-insensitive", async () => {
      const memoryFile = join(memoryDir, "MEMORY.md");
      await writeFile(memoryFile, "My PASSWORD is secret", "utf8");

      const matches = await doctor.scan("password");

      expect(matches.length).toBeGreaterThan(0);
    });

    it("should include context around matches", async () => {
      const memoryFile = join(memoryDir, "MEMORY.md");
      await writeFile(
        memoryFile,
        "Line 1\nLine 2\nMy password is here\nLine 4\nLine 5",
        "utf8"
      );

      const matches = await doctor.scan("password");

      expect(matches[0].context).toBeDefined();
      expect(matches[0].context).toContain("Line 2");
      expect(matches[0].context).toContain("Line 4");
    });

    it("should track line numbers", async () => {
      const memoryFile = join(memoryDir, "MEMORY.md");
      await writeFile(memoryFile, "Line 1\nLine 2\nPassword here\nLine 4", "utf8");

      const matches = await doctor.scan("password");

      expect(matches[0].line).toBe(3);
    });

    it("should find matches in multiple files", async () => {
      await writeFile(join(memoryDir, "MEMORY.md"), "password in memory", "utf8");
      await writeFile(join(memoryDir, "USER.md"), "password in user", "utf8");

      const matches = await doctor.scan("password");

      expect(matches.length).toBe(2);
    });
  });

  describe("scan - Logs layer", () => {
    it("should find matches in conversation logs", async () => {
      // Create agent log structure
      const agentDir = join(logsDir, "agent-123");
      const sessionsDir = join(agentDir, "sessions");
      await mkdir(sessionsDir, { recursive: true });

      const logFile = join(sessionsDir, "session.jsonl");
      await writeFile(
        logFile,
        JSON.stringify({ role: "user", content: "My password is secret" }) + "\n",
        "utf8"
      );

      const matches = await doctor.scan("password");

      expect(matches.some((m) => m.layer === "logs")).toBe(true);
    });

    it("should handle multiple log files", async () => {
      const agentDir = join(logsDir, "agent-123");
      const sessionsDir = join(agentDir, "sessions");
      await mkdir(sessionsDir, { recursive: true });

      await writeFile(
        join(sessionsDir, "session1.jsonl"),
        JSON.stringify({ content: "password 1" }) + "\n",
        "utf8"
      );
      await writeFile(
        join(sessionsDir, "session2.jsonl"),
        JSON.stringify({ content: "password 2" }) + "\n",
        "utf8"
      );

      const matches = await doctor.scan("password");

      expect(matches.filter((m) => m.layer === "logs").length).toBe(2);
    });

    it("should skip invalid JSON lines", async () => {
      const agentDir = join(logsDir, "agent-123");
      const sessionsDir = join(agentDir, "sessions");
      await mkdir(sessionsDir, { recursive: true });

      await writeFile(
        join(sessionsDir, "session.jsonl"),
        "invalid json\n" + JSON.stringify({ content: "password here" }) + "\n",
        "utf8"
      );

      const matches = await doctor.scan("password");

      expect(matches.length).toBe(1); // Only valid JSON
    });
  });

  describe("scan - Cache layer", () => {
    it("should find matches in session cache", async () => {
      const agentDir = join(logsDir, "agent-123");
      await mkdir(agentDir, { recursive: true });

      const cacheFile = join(agentDir, "session.json");
      await writeFile(cacheFile, JSON.stringify({ data: "my password" }), "utf8");

      const matches = await doctor.scan("password");

      expect(matches.some((m) => m.layer === "cache")).toBe(true);
    });
  });

  describe("scan - Backups layer", () => {
    it("should find matches in backup files", async () => {
      const backupsDir = join(testDir, "backups");
      await mkdir(backupsDir, { recursive: true });

      await writeFile(join(backupsDir, "backup.md"), "password in backup", "utf8");

      const matches = await doctor.scan("password");

      expect(matches.some((m) => m.layer === "backups")).toBe(true);
    });

    it("should only scan text files", async () => {
      const backupsDir = join(testDir, "backups");
      await mkdir(backupsDir, { recursive: true });

      await writeFile(join(backupsDir, "backup.md"), "password here", "utf8");
      await writeFile(join(backupsDir, "binary.bin"), Buffer.from([0x00, 0x01]));

      const matches = await doctor.scan("password");

      expect(matches.filter((m) => m.layer === "backups").length).toBe(1);
    });
  });

  describe("purge", () => {
    it("should delete matches from Markdown files", async () => {
      const memoryFile = join(memoryDir, "MEMORY.md");
      await writeFile(
        memoryFile,
        "Line 1\nMy password is secret\nLine 3",
        "utf8"
      );

      const result = await doctor.purge("password", { force: true, preview: false });

      expect(result.matchesDeleted).toBe(1);

      const { readFile } = await import("node:fs/promises");
      const content = await readFile(memoryFile, "utf8");
      expect(content).not.toContain("password");
    });

    it("should delete cache files", async () => {
      const agentDir = join(logsDir, "agent-123");
      await mkdir(agentDir, { recursive: true });

      const cacheFile = join(agentDir, "session.json");
      await writeFile(cacheFile, '{"password": "secret"}', "utf8");

      await doctor.purge("password", { force: true, preview: false });

      const { existsSync } = await import("node:fs");
      expect(existsSync(cacheFile)).toBe(false);
    });

    it("should delete backup files", async () => {
      const backupsDir = join(testDir, "backups");
      await mkdir(backupsDir, { recursive: true });

      const backupFile = join(backupsDir, "backup.md");
      await writeFile(backupFile, "password in backup", "utf8");

      await doctor.purge("password", { force: true, preview: false });

      const { existsSync } = await import("node:fs");
      expect(existsSync(backupFile)).toBe(false);
    });

    it("should return correct purge result", async () => {
      await writeFile(join(memoryDir, "MEMORY.md"), "password", "utf8");
      await writeFile(join(memoryDir, "USER.md"), "password", "utf8");

      const result = await doctor.purge("password", { force: true, preview: false });

      expect(result.query).toBe("password");
      expect(result.matchesFound).toBe(2);
      expect(result.matchesDeleted).toBe(2);
      expect(result.layersAffected).toContain("markdown");
    });

    it("should verify deletion", async () => {
      await writeFile(join(memoryDir, "MEMORY.md"), "password here", "utf8");

      const result = await doctor.purge("password", { force: true, preview: false });

      expect(result.verificationPassed).toBe(true);
    });

    it("should handle dry run mode", async () => {
      await writeFile(join(memoryDir, "MEMORY.md"), "password", "utf8");

      const result = await doctor.purge("password", { dryRun: true });

      expect(result.matchesFound).toBe(1);
      expect(result.matchesDeleted).toBe(0);

      // File should still exist
      const { readFile } = await import("node:fs/promises");
      const content = await readFile(join(memoryDir, "MEMORY.md"), "utf8");
      expect(content).toContain("password");
    });
  });

  describe("verify", () => {
    it("should return true when no matches exist", async () => {
      await writeFile(join(memoryDir, "MEMORY.md"), "no secrets here", "utf8");

      const verified = await doctor.verify("password");

      expect(verified).toBe(true);
    });

    it("should return false when matches still exist", async () => {
      await writeFile(join(memoryDir, "MEMORY.md"), "password is here", "utf8");

      const verified = await doctor.verify("password");

      expect(verified).toBe(false);
    });
  });

  describe("audit trail", () => {
    it("should log purge operations", async () => {
      await writeFile(join(memoryDir, "MEMORY.md"), "password", "utf8");

      await doctor.purge("password", { force: true, preview: false });

      const history = await doctor.getAuditHistory();

      expect(history.length).toBeGreaterThan(0);
      expect(history[history.length - 1].query).toBe("password");
    });

    it("should include purge details in audit", async () => {
      await writeFile(join(memoryDir, "MEMORY.md"), "password", "utf8");

      await doctor.purge("password", { force: true, preview: false });

      const history = await doctor.getAuditHistory();
      const latest = history[history.length - 1];

      expect(latest.matchesFound).toBeGreaterThan(0);
      expect(latest.matchesDeleted).toBeGreaterThan(0);
      expect(latest.layersAffected).toContain("markdown");
      expect(latest.verificationPassed).toBe(true);
    });

    it("should limit history results", async () => {
      // Create multiple purge entries
      await writeFile(join(memoryDir, "MEMORY.md"), "test1 test2 test3", "utf8");

      await doctor.purge("test1", { force: true, preview: false });
      await doctor.purge("test2", { force: true, preview: false });
      await doctor.purge("test3", { force: true, preview: false });

      const history = await doctor.getAuditHistory(2);

      expect(history.length).toBeLessThanOrEqual(2);
    });
  });

  describe("edge cases", () => {
    it("should handle empty directories", async () => {
      const matches = await doctor.scan("anything");

      expect(matches).toEqual([]);
    });

    it("should handle non-existent directories", async () => {
      const emptyDoctor = new MemoryDoctor("/nonexistent");

      const matches = await emptyDoctor.scan("test");

      expect(matches).toEqual([]);
    });

    it("should handle empty query result", async () => {
      await writeFile(join(memoryDir, "MEMORY.md"), "no matches", "utf8");

      const result = await doctor.purge("nonexistent", { force: true });

      expect(result.matchesFound).toBe(0);
      expect(result.matchesDeleted).toBe(0);
    });
  });
});
