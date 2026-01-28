import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  encrypt,
  decrypt,
  deriveKey,
  generateSalt,
  generateIV,
  isFileEncrypted,
  readEncryptedFile,
  writeEncryptedFile,
  migrateToEncrypted,
  migrateDirectory,
  validatePassphrase,
  keyCache,
} from "./encryption-at-rest.js";

describe("MemoryEncryption", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "memory-encryption-test-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    keyCache.clear();
  });

  describe("Key Derivation", () => {
    it("derives consistent keys from same passphrase + salt", async () => {
      const passphrase = "my-secure-passphrase";
      const salt = generateSalt();

      const key1 = await deriveKey(passphrase, salt);
      const key2 = await deriveKey(passphrase, salt);

      expect(key1.equals(key2)).toBe(true);
    });

    it("derives different keys for different passphrases", async () => {
      const salt = generateSalt();

      const key1 = await deriveKey("passphrase1", salt);
      const key2 = await deriveKey("passphrase2", salt);

      expect(key1.equals(key2)).toBe(false);
    });

    it("derives different keys for different salts", async () => {
      const passphrase = "same-passphrase";

      const key1 = await deriveKey(passphrase, generateSalt());
      const key2 = await deriveKey(passphrase, generateSalt());

      expect(key1.equals(key2)).toBe(false);
    });

    it("rejects empty passphrase", async () => {
      const salt = generateSalt();
      await expect(deriveKey("", salt)).rejects.toThrow("cannot be empty");
    });

    it("rejects short passphrase", async () => {
      const salt = generateSalt();
      await expect(deriveKey("short", salt)).rejects.toThrow("at least 8 characters");
    });
  });

  describe("Encryption/Decryption", () => {
    it("encrypts and decrypts text correctly", async () => {
      const plaintext = "This is sensitive conversation history";
      const passphrase = "strong-passphrase-123";

      const encrypted = await encrypt(plaintext, passphrase);
      const decrypted = await decrypt(encrypted, passphrase);

      expect(decrypted).toBe(plaintext);
    });

    it("produces different ciphertext for same plaintext (due to random IV)", async () => {
      const plaintext = "Same text";
      const passphrase = "same-passphrase";

      const encrypted1 = await encrypt(plaintext, passphrase);
      const encrypted2 = await encrypt(plaintext, passphrase);

      expect(encrypted1).not.toBe(encrypted2);

      // But both decrypt correctly
      expect(await decrypt(encrypted1, passphrase)).toBe(plaintext);
      expect(await decrypt(encrypted2, passphrase)).toBe(plaintext);
    });

    it("fails decryption with wrong passphrase", async () => {
      const plaintext = "Secret message";
      const encrypted = await encrypt(plaintext, "correct-passphrase");

      await expect(decrypt(encrypted, "wrong-passphrase")).rejects.toThrow("Decryption failed");
    });

    it("handles Unicode characters", async () => {
      const plaintext = "שלום! こんにちは 🔒🔐";
      const passphrase = "unicode-test";

      const encrypted = await encrypt(plaintext, passphrase);
      const decrypted = await decrypt(encrypted, passphrase);

      expect(decrypted).toBe(plaintext);
    });

    it("handles large text", async () => {
      const plaintext = "A".repeat(100000); // 100KB
      const passphrase = "large-text-test";

      const encrypted = await encrypt(plaintext, passphrase);
      const decrypted = await decrypt(encrypted, passphrase);

      expect(decrypted).toBe(plaintext);
      expect(decrypted.length).toBe(100000);
    });

    it("includes header in encrypted output", async () => {
      const encrypted = await encrypt("test", "passphrase");
      expect(encrypted).toContain("ENCRYPTED_MEMORY_V1");
    });

    it("includes metadata in encrypted output", async () => {
      const encrypted = await encrypt("test", "passphrase");
      expect(encrypted).toContain('"algorithm"');
      expect(encrypted).toContain('"salt"');
      expect(encrypted).toContain('"iv"');
      expect(encrypted).toContain('"authTag"');
    });
  });

  describe("File Operations", () => {
    it("detects encrypted files", async () => {
      const filePath = join(testDir, "test.txt");
      const encrypted = await encrypt("content", "pass");
      await writeFile(filePath, encrypted);

      expect(await isFileEncrypted(filePath)).toBe(true);
    });

    it("detects plaintext files", async () => {
      const filePath = join(testDir, "plain.txt");
      await writeFile(filePath, "Plain content");

      expect(await isFileEncrypted(filePath)).toBe(false);
    });

    it("reads encrypted file", async () => {
      const filePath = join(testDir, "encrypted.txt");
      const plaintext = "Sensitive data";
      const passphrase = "secure-pass";

      await writeEncryptedFile(filePath, plaintext, passphrase);

      const result = await readEncryptedFile(filePath, passphrase);
      expect(result.plaintext).toBe(plaintext);
      expect(result.metadata.encrypted).toBe(true);
      expect(result.metadata.algorithm).toBe("aes-256-gcm");
    });

    it("reads plaintext file (backward compatible)", async () => {
      const filePath = join(testDir, "plain.txt");
      const plaintext = "Old plaintext content";

      await writeFile(filePath, plaintext);

      const result = await readEncryptedFile(filePath, "any-pass");
      expect(result.plaintext).toBe(plaintext);
      expect(result.metadata.encrypted).toBe(false);
      expect(result.metadata.algorithm).toBe("none");
    });

    it("writes encrypted file with secure permissions", async () => {
      const filePath = join(testDir, "secure.txt");
      await writeEncryptedFile(filePath, "content", "pass");

      const stat = await import("node:fs/promises").then(m => m.stat(filePath));
      const mode = (stat.mode & 0o777).toString(8);

      // Should be 600 (owner read/write only)
      expect(mode).toBe("600");
    });
  });

  describe("Migration", () => {
    it("migrates plaintext file to encrypted", async () => {
      const filePath = join(testDir, "migrate.txt");
      const plaintext = "Old plaintext memory";
      const passphrase = "migration-pass";

      // Write plaintext
      await writeFile(filePath, plaintext);
      expect(await isFileEncrypted(filePath)).toBe(false);

      // Migrate
      const migrated = await migrateToEncrypted(filePath, passphrase);
      expect(migrated).toBe(true);
      expect(await isFileEncrypted(filePath)).toBe(true);

      // Can decrypt
      const result = await readEncryptedFile(filePath, passphrase);
      expect(result.plaintext).toBe(plaintext);
    });

    it("skips already encrypted files", async () => {
      const filePath = join(testDir, "already.txt");
      const passphrase = "pass";

      await writeEncryptedFile(filePath, "content", passphrase);

      const migrated = await migrateToEncrypted(filePath, passphrase);
      expect(migrated).toBe(false);
    });

    it("migrates directory of files", async () => {
      const file1 = join(testDir, "file1.txt");
      const file2 = join(testDir, "file2.txt");
      const file3 = join(testDir, "file3.txt");

      await writeFile(file1, "Content 1");
      await writeFile(file2, "Content 2");
      await writeEncryptedFile(file3, "Already encrypted", "pass");

      const result = await migrateDirectory([file1, file2, file3], "pass");

      expect(result.migrated).toBe(2);  // file1, file2
      expect(result.skipped).toBe(1);   // file3 already encrypted
      expect(result.failed).toBe(0);
    });
  });

  describe("Passphrase Validation", () => {
    it("rejects too short passphrase", () => {
      const result = validatePassphrase("short");
      expect(result.valid).toBe(false);
      expect(result.feedback).toContain("must be at least 8 characters");
    });

    it("accepts strong passphrase", () => {
      const result = validatePassphrase("MyStr0ng!Passphrase2024");
      expect(result.valid).toBe(true);
      expect(result.score).toBeGreaterThan(80);
    });

    it("warns about weak patterns", () => {
      const result = validatePassphrase("password123");
      expect(result.feedback.some(f => f.includes("common words"))).toBe(true);
    });

    it("recommends complexity improvements", () => {
      const result = validatePassphrase("alllowercase");
      expect(result.feedback.some(f => f.includes("uppercase"))).toBe(true);
      expect(result.feedback.some(f => f.includes("numbers"))).toBe(true);
      expect(result.feedback.some(f => f.includes("special"))).toBe(true);
    });

    it("scores length appropriately", () => {
      const short = validatePassphrase("Abcd123!");    // 8 chars
      const medium = validatePassphrase("Abcdef123!");  // 10 chars
      const long = validatePassphrase("Abcdefghij123!"); // 14 chars

      expect(short.score).toBeLessThan(medium.score);
      expect(medium.score).toBeLessThan(long.score);
    });
  });

  describe("Key Cache", () => {
    it("caches derived keys", async () => {
      const passphrase = "cache-test";
      const salt = generateSalt();

      const start1 = Date.now();
      const key1 = await keyCache.getOrDerive(passphrase, salt);
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      const key2 = await keyCache.getOrDerive(passphrase, salt);
      const time2 = Date.now() - start2;

      expect(key1.equals(key2)).toBe(true);
      expect(time2).toBeLessThan(time1); // Cached should be faster
    });

    it("clears cache", async () => {
      const passphrase = "clear-test";
      const salt = generateSalt();

      await keyCache.getOrDerive(passphrase, salt);
      keyCache.clear();

      // Should derive again (not from cache)
      const key = await keyCache.getOrDerive(passphrase, salt);
      expect(key).toBeDefined();
    });
  });

  describe("Error Handling", () => {
    it("handles corrupted encrypted data", async () => {
      const corrupted = "ENCRYPTED_MEMORY_V1\n{corrupted json";
      await expect(decrypt(corrupted, "pass")).rejects.toThrow("Invalid encrypted data");
    });

    it("handles missing encryption fields", async () => {
      const invalid = "ENCRYPTED_MEMORY_V1\n" + JSON.stringify({
        version: "1.0",
        algorithm: "aes-256-gcm",
        // Missing salt, iv, authTag, ciphertext
      });
      await expect(decrypt(invalid, "pass")).rejects.toThrow("Missing required encryption fields");
    });

    it("handles non-existent file", async () => {
      const result = await isFileEncrypted(join(testDir, "nonexistent.txt"));
      expect(result).toBe(false);
    });
  });
});
