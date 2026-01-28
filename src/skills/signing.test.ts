/**
 * Tests for skill signing and verification
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  SkillSigner,
  TrustLevel,
  generateKeyPair,
  getKeyFingerprint,
  isSigned,
  loadSignature,
} from "./signing.js";
import { writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("SkillSigner", () => {
  let signer: SkillSigner;
  let testDir: string;
  let skillDir: string;
  let keyPair: ReturnType<typeof generateKeyPair>;

  beforeEach(async () => {
    signer = new SkillSigner();

    // Create temp directories
    testDir = join(tmpdir(), `signing-test-${Date.now()}`);
    skillDir = join(testDir, "test-skill");
    await mkdir(skillDir, { recursive: true });

    // Generate key pair for testing
    keyPair = generateKeyPair();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("sign", () => {
    it("should sign a skill", async () => {
      // Create skill files
      await writeFile(join(skillDir, "index.ts"), "export default {};", "utf8");
      await writeFile(join(skillDir, "README.md"), "# Test Skill", "utf8");

      const signature = await signer.sign(skillDir, keyPair.privateKey);

      expect(signature.version).toBe("1.0");
      expect(signature.algorithm).toBe("ed25519-sha256");
      expect(signature.digest).toBeTruthy();
      expect(signature.signature).toBeTruthy();
      expect(signature.signedBy).toBeTruthy();
      expect(signature.timestamp).toBeTruthy();
      expect(signature.files).toHaveLength(2);
      expect(signature.files).toContain("index.ts");
      expect(signature.files).toContain("README.md");
    });

    it("should create signature file", async () => {
      await writeFile(join(skillDir, "index.ts"), "export default {};", "utf8");

      await signer.sign(skillDir, keyPair.privateKey);

      expect(isSigned(skillDir)).toBe(true);

      const signature = await loadSignature(skillDir);
      expect(signature).toBeTruthy();
    });

    it("should include all files in signature", async () => {
      // Create multiple files
      await writeFile(join(skillDir, "index.ts"), "code", "utf8");
      await writeFile(join(skillDir, "helper.ts"), "code", "utf8");
      await writeFile(join(skillDir, "README.md"), "docs", "utf8");
      await writeFile(join(skillDir, "package.json"), "{}", "utf8");

      const signature = await signer.sign(skillDir, keyPair.privateKey);

      expect(signature.files).toHaveLength(4);
    });

    it("should handle subdirectories", async () => {
      // Create nested structure
      await mkdir(join(skillDir, "src"), { recursive: true });
      await writeFile(join(skillDir, "src", "index.ts"), "code", "utf8");
      await writeFile(join(skillDir, "README.md"), "docs", "utf8");

      const signature = await signer.sign(skillDir, keyPair.privateKey);

      expect(signature.files).toContain("src/index.ts");
      expect(signature.files).toContain("README.md");
    });

    it("should throw on non-existent directory", async () => {
      await expect(signer.sign("/nonexistent", keyPair.privateKey)).rejects.toThrow();
    });

    it("should not include previous signature in new signature", async () => {
      await writeFile(join(skillDir, "index.ts"), "code", "utf8");

      // First signature
      await signer.sign(skillDir, keyPair.privateKey);

      // Second signature (re-sign)
      const signature2 = await signer.sign(skillDir, keyPair.privateKey);

      // Should not include SIGNATURE.json in files list
      expect(signature2.files).not.toContain("SIGNATURE.json");
    });
  });

  describe("verify", () => {
    beforeEach(async () => {
      // Create and sign a skill for verification tests
      await writeFile(join(skillDir, "index.ts"), "export default {};", "utf8");
      await signer.sign(skillDir, keyPair.privateKey);
    });

    it("should verify valid signature", async () => {
      const result = await signer.verify(skillDir, [keyPair.publicKey]);

      expect(result.valid).toBe(true);
      expect(result.trustLevel).toBe(TrustLevel.VERIFIED);
      expect(result.signedBy).toBeTruthy();
      expect(result.timestamp).toBeTruthy();
    });

    it("should reject unsigned skill", async () => {
      const unsignedDir = join(testDir, "unsigned-skill");
      await mkdir(unsignedDir);
      await writeFile(join(unsignedDir, "index.ts"), "code", "utf8");

      const result = await signer.verify(unsignedDir, [keyPair.publicKey]);

      expect(result.valid).toBe(false);
      expect(result.trustLevel).toBe(TrustLevel.UNSIGNED);
      expect(result.reason).toContain("No signature found");
    });

    it("should detect tampered files (content modified)", async () => {
      // Modify file after signing
      await writeFile(join(skillDir, "index.ts"), "MODIFIED CODE", "utf8");

      const result = await signer.verify(skillDir, [keyPair.publicKey]);

      expect(result.valid).toBe(false);
      expect(result.trustLevel).toBe(TrustLevel.TAMPERED);
      expect(result.reason).toContain("modified");
    });

    it("should detect added files", async () => {
      // Add new file after signing
      await writeFile(join(skillDir, "malicious.ts"), "evil code", "utf8");

      const result = await signer.verify(skillDir, [keyPair.publicKey]);

      expect(result.valid).toBe(false);
      expect(result.trustLevel).toBe(TrustLevel.TAMPERED);
      expect(result.reason).toContain("modified");
    });

    it("should detect removed files", async () => {
      // Remove file after signing
      await rm(join(skillDir, "index.ts"));

      const result = await signer.verify(skillDir, [keyPair.publicKey]);

      expect(result.valid).toBe(false);
      expect(result.trustLevel).toBe(TrustLevel.TAMPERED);
    });

    it("should reject signature from untrusted key", async () => {
      // Generate different key pair
      const otherKey = generateKeyPair();

      const result = await signer.verify(skillDir, [otherKey.publicKey]);

      expect(result.valid).toBe(false);
      expect(result.trustLevel).toBe(TrustLevel.UNSIGNED);
      expect(result.reason).toContain("not from trusted developer");
    });

    it("should verify with multiple trusted keys", async () => {
      const key2 = generateKeyPair();
      const key3 = generateKeyPair();

      // Verify with list including correct key
      const result = await signer.verify(skillDir, [
        key2.publicKey,
        keyPair.publicKey, // Correct one
        key3.publicKey,
      ]);

      expect(result.valid).toBe(true);
    });

    it("should throw on non-existent directory", async () => {
      await expect(signer.verify("/nonexistent", [keyPair.publicKey])).rejects.toThrow();
    });
  });
});

describe("generateKeyPair", () => {
  it("should generate valid key pair", () => {
    const keyPair = generateKeyPair();

    expect(keyPair.publicKey).toContain("BEGIN PUBLIC KEY");
    expect(keyPair.privateKey).toContain("BEGIN PRIVATE KEY");
    expect(keyPair.fingerprint).toHaveLength(64); // SHA256 hex
  });

  it("should generate unique key pairs", () => {
    const pair1 = generateKeyPair();
    const pair2 = generateKeyPair();

    expect(pair1.fingerprint).not.toBe(pair2.fingerprint);
    expect(pair1.publicKey).not.toBe(pair2.publicKey);
    expect(pair1.privateKey).not.toBe(pair2.privateKey);
  });
});

describe("getKeyFingerprint", () => {
  it("should calculate fingerprint from public key", () => {
    const keyPair = generateKeyPair();

    const fingerprint = getKeyFingerprint(keyPair.publicKey);

    expect(fingerprint).toBe(keyPair.fingerprint);
    expect(fingerprint).toHaveLength(64);
  });

  it("should be deterministic", () => {
    const keyPair = generateKeyPair();

    const fp1 = getKeyFingerprint(keyPair.publicKey);
    const fp2 = getKeyFingerprint(keyPair.publicKey);

    expect(fp1).toBe(fp2);
  });

  it("should be unique per key", () => {
    const pair1 = generateKeyPair();
    const pair2 = generateKeyPair();

    const fp1 = getKeyFingerprint(pair1.publicKey);
    const fp2 = getKeyFingerprint(pair2.publicKey);

    expect(fp1).not.toBe(fp2);
  });
});

describe("isSigned", () => {
  let testDir: string;
  let signedDir: string;
  let unsignedDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `is-signed-test-${Date.now()}`);
    signedDir = join(testDir, "signed");
    unsignedDir = join(testDir, "unsigned");

    await mkdir(signedDir, { recursive: true });
    await mkdir(unsignedDir, { recursive: true });

    // Create signature in signed dir
    await writeFile(join(signedDir, "SIGNATURE.json"), "{}", "utf8");
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("should return true for signed skill", () => {
    expect(isSigned(signedDir)).toBe(true);
  });

  it("should return false for unsigned skill", () => {
    expect(isSigned(unsignedDir)).toBe(false);
  });
});

describe("loadSignature", () => {
  let testDir: string;
  let skillDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `load-sig-test-${Date.now()}`);
    skillDir = join(testDir, "skill");
    await mkdir(skillDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("should load signature from skill", async () => {
    const mockSignature = {
      version: "1.0",
      algorithm: "ed25519-sha256",
      digest: "abc123",
      signature: "def456",
      signedBy: "key-fingerprint",
      timestamp: new Date().toISOString(),
      files: ["index.ts"],
    };

    await writeFile(join(skillDir, "SIGNATURE.json"), JSON.stringify(mockSignature), "utf8");

    const loaded = await loadSignature(skillDir);

    expect(loaded).toEqual(mockSignature);
  });

  it("should return null for unsigned skill", async () => {
    const loaded = await loadSignature(skillDir);

    expect(loaded).toBeNull();
  });
});
