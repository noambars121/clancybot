/**
 * Memory Encryption at Rest
 * 
 * Protects conversation history and memory files from Infostealer malware
 * by encrypting them on disk with AES-256-GCM.
 * 
 * Features:
 * - Transparent encryption/decryption
 * - Key derivation from user passphrase (scrypt)
 * - Backward compatible (migrates plaintext → encrypted)
 * - Session-based key caching (decrypt once per session)
 * 
 * Addresses: Infostealer malware threat (Hudson Rock research)
 * 
 * @module memory/encryption-at-rest
 */

import { randomBytes, scrypt, createCipheriv, createDecipheriv } from "node:crypto";
import { readFile, writeFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { log } from "../logging.js";

const scryptAsync = promisify(scrypt);

// ============================================================================
// Types
// ============================================================================

export type EncryptionConfig = {
  algorithm: "aes-256-gcm";
  keyLength: 32;
  ivLength: 16;
  saltLength: 32;
  tagLength: 16;
  scryptCost: number;
};

export type EncryptedFile = {
  version: "1.0";
  algorithm: string;
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
};

export type DecryptionResult = {
  plaintext: string;
  metadata: {
    algorithm: string;
    encrypted: boolean;
  };
};

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: EncryptionConfig = {
  algorithm: "aes-256-gcm",
  keyLength: 32,
  ivLength: 16,
  saltLength: 32,
  tagLength: 16,
  scryptCost: 16384, // N=2^14 (moderate security, ~100ms)
};

const ENCRYPTED_HEADER = "ENCRYPTED_MEMORY_V1";

// ============================================================================
// Key Management
// ============================================================================

/**
 * Derive encryption key from passphrase using scrypt
 */
export async function deriveKey(
  passphrase: string,
  salt: Buffer,
  config: EncryptionConfig = DEFAULT_CONFIG,
): Promise<Buffer> {
  if (!passphrase || passphrase.length === 0) {
    throw new Error("Passphrase cannot be empty");
  }

  if (passphrase.length < 8) {
    throw new Error("Passphrase must be at least 8 characters");
  }

  try {
    const key = (await scryptAsync(passphrase, salt, config.keyLength, {
      N: config.scryptCost,
      r: 8,
      p: 1,
    })) as Buffer;

    return key;
  } catch (err) {
    throw new Error(`Key derivation failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Generate random salt for key derivation
 */
export function generateSalt(length = DEFAULT_CONFIG.saltLength): Buffer {
  return randomBytes(length);
}

/**
 * Generate random IV (initialization vector)
 */
export function generateIV(length = DEFAULT_CONFIG.ivLength): Buffer {
  return randomBytes(length);
}

// ============================================================================
// Encryption
// ============================================================================

/**
 * Encrypt plaintext with AES-256-GCM
 */
export async function encrypt(
  plaintext: string,
  passphrase: string,
  config: EncryptionConfig = DEFAULT_CONFIG,
): Promise<string> {
  // Generate salt and IV
  const salt = generateSalt(config.saltLength);
  const iv = generateIV(config.ivLength);

  // Derive key from passphrase
  const key = await deriveKey(passphrase, salt, config);

  // Create cipher
  const cipher = createCipheriv(config.algorithm, key, iv);

  // Encrypt
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  // Get authentication tag
  const authTag = cipher.getAuthTag();

  // Create encrypted file structure
  const encrypted: EncryptedFile = {
    version: "1.0",
    algorithm: config.algorithm,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };

  // Return as JSON with header
  return ENCRYPTED_HEADER + "\n" + JSON.stringify(encrypted, null, 2);
}

/**
 * Decrypt ciphertext with AES-256-GCM
 */
export async function decrypt(
  encryptedData: string,
  passphrase: string,
  config: EncryptionConfig = DEFAULT_CONFIG,
): Promise<string> {
  // Remove header if present
  const dataWithoutHeader = encryptedData.startsWith(ENCRYPTED_HEADER)
    ? encryptedData.slice(ENCRYPTED_HEADER.length).trim()
    : encryptedData;

  // Parse encrypted structure
  let encrypted: EncryptedFile;
  try {
    encrypted = JSON.parse(dataWithoutHeader);
  } catch (err) {
    throw new Error("Invalid encrypted data format");
  }

  // Validate structure
  if (!encrypted.salt || !encrypted.iv || !encrypted.authTag || !encrypted.ciphertext) {
    throw new Error("Missing required encryption fields");
  }

  // Convert from base64
  const salt = Buffer.from(encrypted.salt, "base64");
  const iv = Buffer.from(encrypted.iv, "base64");
  const authTag = Buffer.from(encrypted.authTag, "base64");
  const ciphertext = Buffer.from(encrypted.ciphertext, "base64");

  // Derive key from passphrase
  const key = await deriveKey(passphrase, salt, config);

  // Create decipher
  const decipher = createDecipheriv(config.algorithm, key, iv);
  decipher.setAuthTag(authTag);

  // Decrypt
  try {
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return plaintext.toString("utf8");
  } catch (err) {
    throw new Error("Decryption failed: incorrect passphrase or corrupted data");
  }
}

// ============================================================================
// File Operations
// ============================================================================

/**
 * Check if a file is encrypted
 */
export async function isFileEncrypted(filePath: string): Promise<boolean> {
  try {
    const content = await readFile(filePath, "utf8");
    return content.startsWith(ENCRYPTED_HEADER);
  } catch (err) {
    return false;
  }
}

/**
 * Read and decrypt a file
 */
export async function readEncryptedFile(
  filePath: string,
  passphrase: string,
): Promise<DecryptionResult> {
  const content = await readFile(filePath, "utf8");

  // Check if encrypted
  if (!content.startsWith(ENCRYPTED_HEADER)) {
    // Plaintext file
    return {
      plaintext: content,
      metadata: {
        algorithm: "none",
        encrypted: false,
      },
    };
  }

  // Decrypt
  const plaintext = await decrypt(content, passphrase);

  return {
    plaintext,
    metadata: {
      algorithm: "aes-256-gcm",
      encrypted: true,
    },
  };
}

/**
 * Encrypt and write a file
 */
export async function writeEncryptedFile(
  filePath: string,
  plaintext: string,
  passphrase: string,
): Promise<void> {
  const encrypted = await encrypt(plaintext, passphrase);
  await writeFile(filePath, encrypted, { mode: 0o600 });
  log.debug(`Encrypted file written: ${filePath}`);
}

/**
 * Migrate plaintext file to encrypted
 */
export async function migrateToEncrypted(
  filePath: string,
  passphrase: string,
): Promise<boolean> {
  try {
    // Check if already encrypted
    if (await isFileEncrypted(filePath)) {
      log.debug(`File already encrypted: ${filePath}`);
      return false;
    }

    // Read plaintext
    const plaintext = await readFile(filePath, "utf8");

    // Encrypt and write back
    await writeEncryptedFile(filePath, plaintext, passphrase);

    log.info(`Migrated to encrypted: ${filePath}`);
    return true;
  } catch (err) {
    log.error(`Failed to migrate ${filePath}:`, err);
    throw err;
  }
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Migrate multiple files to encrypted format
 */
export async function migrateDirectory(
  filePaths: string[],
  passphrase: string,
): Promise<{ migrated: number; skipped: number; failed: number }> {
  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const filePath of filePaths) {
    try {
      const wasMigrated = await migrateToEncrypted(filePath, passphrase);
      if (wasMigrated) {
        migrated++;
      } else {
        skipped++;
      }
    } catch (err) {
      log.error(`Failed to migrate ${filePath}:`, err);
      failed++;
    }
  }

  return { migrated, skipped, failed };
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate passphrase strength
 */
export function validatePassphrase(passphrase: string): {
  valid: boolean;
  score: number;
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;

  // Length check
  if (passphrase.length < 8) {
    feedback.push("Passphrase must be at least 8 characters");
    return { valid: false, score: 0, feedback };
  }

  if (passphrase.length >= 8) score += 20;
  if (passphrase.length >= 12) score += 20;
  if (passphrase.length >= 16) score += 20;

  // Complexity checks
  if (/[a-z]/.test(passphrase)) score += 10; // lowercase
  if (/[A-Z]/.test(passphrase)) score += 10; // uppercase
  if (/[0-9]/.test(passphrase)) score += 10; // numbers
  if (/[^a-zA-Z0-9]/.test(passphrase)) score += 10; // special chars

  // Recommendations
  if (passphrase.length < 12) {
    feedback.push("Consider using at least 12 characters");
  }
  if (!/[A-Z]/.test(passphrase)) {
    feedback.push("Add uppercase letters for better security");
  }
  if (!/[0-9]/.test(passphrase)) {
    feedback.push("Add numbers for better security");
  }
  if (!/[^a-zA-Z0-9]/.test(passphrase)) {
    feedback.push("Add special characters for better security");
  }

  // Common patterns
  if (/^[0-9]+$/.test(passphrase)) {
    feedback.push("Avoid using only numbers");
    score -= 20;
  }
  if (/^[a-z]+$/.test(passphrase)) {
    feedback.push("Avoid using only lowercase letters");
    score -= 20;
  }
  if (/password|123456|qwerty/i.test(passphrase)) {
    feedback.push("Avoid common words and patterns");
    score -= 30;
  }

  return {
    valid: score >= 50,
    score: Math.max(0, Math.min(100, score)),
    feedback,
  };
}

// ============================================================================
// Session Key Cache
// ============================================================================

/**
 * In-memory key cache for session (decrypt once, use many times)
 */
class KeyCache {
  private cache = new Map<string, { key: Buffer; expiry: number }>();
  private readonly ttl = 3600000; // 1 hour

  async getOrDerive(passphrase: string, salt: Buffer): Promise<Buffer> {
    const cacheKey = `${passphrase}-${salt.toString("base64")}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() < cached.expiry) {
      return cached.key;
    }

    // Derive new key
    const key = await deriveKey(passphrase, salt);
    this.cache.set(cacheKey, { key, expiry: Date.now() + this.ttl });

    return key;
  }

  clear(): void {
    this.cache.clear();
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now >= value.expiry) {
        this.cache.delete(key);
      }
    }
  }
}

export const keyCache = new KeyCache();

// Auto-cleanup every 10 minutes
setInterval(() => keyCache.cleanup(), 600000);

// ============================================================================
// Export
// ============================================================================

export const MemoryEncryption = {
  encrypt,
  decrypt,
  deriveKey,
  isFileEncrypted,
  readEncryptedFile,
  writeEncryptedFile,
  migrateToEncrypted,
  migrateDirectory,
  validatePassphrase,
  keyCache,
};
