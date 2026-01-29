/**
 * Trust Store - Manage trusted developers for skill signing
 *
 * Maintains a list of trusted public keys with metadata:
 * - Official Moltbot team (auto-approve)
 * - Verified developers (approve with notice)
 * - Community developers (warn + approve)
 *
 * @see Phase 9 - Pentagon+++ Security
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { getChildLogger } from "../logging.js";
import { TrustLevel, getKeyFingerprint } from "./signing.js";

const log = getChildLogger({ module: "trust-store" });

// ============================================================================
// Types
// ============================================================================

export type TrustedDeveloper = {
  fingerprint: string;
  name: string;
  email?: string;
  level: TrustLevel;
  publicKey: string; // PEM format
  addedAt: string; // ISO timestamp
  addedBy?: string; // Who added this developer
  notes?: string;
};

export type TrustStoreData = {
  version: string;
  updated: string;
  developers: TrustedDeveloper[];
};

// ============================================================================
// Trust Store
// ============================================================================

export class TrustStore {
  private developers: Map<string, TrustedDeveloper> = new Map();
  private storePath: string;

  constructor(storePath?: string) {
    this.storePath = storePath || this.getDefaultPath();
  }

  /**
   * Get default trust store path
   */
  private getDefaultPath(): string {
    return join(homedir(), ".moltbot", "security", "trust-store.json");
  }

  /**
   * Load trust store from disk
   */
  async load(): Promise<void> {
    if (!existsSync(this.storePath)) {
      log.debug("Trust store not found, creating default", { path: this.storePath });
      await this.initializeDefault();
      return;
    }

    const content = await readFile(this.storePath, "utf8");
    const data: TrustStoreData = JSON.parse(content);

    this.developers.clear();
    for (const dev of data.developers) {
      this.developers.set(dev.fingerprint, dev);
    }

    log.info("Loaded trust store", {
      path: this.storePath,
      count: this.developers.size,
    });
  }

  /**
   * Save trust store to disk
   */
  async save(): Promise<void> {
    // Ensure directory exists
    await mkdir(dirname(this.storePath), { recursive: true });

    const data: TrustStoreData = {
      version: "1.0",
      updated: new Date().toISOString(),
      developers: Array.from(this.developers.values()),
    };

    await writeFile(this.storePath, JSON.stringify(data, null, 2), "utf8");

    log.info("Saved trust store", {
      path: this.storePath,
      count: this.developers.size,
    });
  }

  /**
   * Initialize with default trusted developers
   */
  private async initializeDefault(): Promise<void> {
    // Add official Moltbot team keys
    // TODO: Replace with real keys
    const officialKeys = this.getOfficialKeys();

    for (const key of officialKeys) {
      this.addDeveloper(key);
    }

    await this.save();
  }

  /**
   * Get official Moltbot team keys
   */
  private getOfficialKeys(): TrustedDeveloper[] {
    // TODO: Replace with real official keys
    // For now, this is a placeholder
    return [
      {
        fingerprint: "official-moltbot-team-key",
        name: "Moltbot Official Team",
        email: "team@molt.bot",
        level: TrustLevel.OFFICIAL,
        publicKey: "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----",
        addedAt: new Date().toISOString(),
        addedBy: "system",
        notes: "Official Moltbot team signing key",
      },
    ];
  }

  /**
   * Add trusted developer
   */
  addDeveloper(dev: TrustedDeveloper): void {
    // Validate fingerprint matches public key
    const calculatedFingerprint = getKeyFingerprint(dev.publicKey);
    if (calculatedFingerprint !== dev.fingerprint) {
      throw new Error("Fingerprint does not match public key!");
    }

    this.developers.set(dev.fingerprint, dev);

    log.info("Added trusted developer", {
      name: dev.name,
      fingerprint: dev.fingerprint.slice(0, 16),
      level: dev.level,
    });
  }

  /**
   * Remove developer by fingerprint
   */
  removeDeveloper(fingerprint: string): boolean {
    const removed = this.developers.delete(fingerprint);

    if (removed) {
      log.info("Removed developer", { fingerprint: fingerprint.slice(0, 16) });
    }

    return removed;
  }

  /**
   * Get developer by fingerprint
   */
  getDeveloper(fingerprint: string): TrustedDeveloper | undefined {
    return this.developers.get(fingerprint);
  }

  /**
   * Get all developers
   */
  getAllDevelopers(): TrustedDeveloper[] {
    return Array.from(this.developers.values());
  }

  /**
   * Get developers by trust level
   */
  getDevelopersByLevel(level: TrustLevel): TrustedDeveloper[] {
    return this.getAllDevelopers().filter((dev) => dev.level === level);
  }

  /**
   * Get all public keys
   */
  getAllPublicKeys(): string[] {
    return this.getAllDevelopers().map((dev) => dev.publicKey);
  }

  /**
   * Check if fingerprint is trusted
   */
  isTrusted(fingerprint: string): boolean {
    return this.developers.has(fingerprint);
  }

  /**
   * Get trust level for fingerprint
   */
  getTrustLevel(fingerprint: string): TrustLevel {
    const dev = this.developers.get(fingerprint);
    return dev?.level || TrustLevel.UNSIGNED;
  }

  /**
   * Update developer trust level
   */
  updateTrustLevel(fingerprint: string, newLevel: TrustLevel): void {
    const dev = this.developers.get(fingerprint);

    if (!dev) {
      throw new Error(`Developer not found: ${fingerprint}`);
    }

    dev.level = newLevel;

    log.info("Updated trust level", {
      fingerprint: fingerprint.slice(0, 16),
      level: newLevel,
    });
  }

  /**
   * Import developer from public key
   */
  async importDeveloper(
    publicKey: string,
    name: string,
    level: TrustLevel = TrustLevel.COMMUNITY,
    email?: string
  ): Promise<TrustedDeveloper> {
    const fingerprint = getKeyFingerprint(publicKey);

    // Check if already exists
    if (this.developers.has(fingerprint)) {
      throw new Error(`Developer already exists: ${name}`);
    }

    const dev: TrustedDeveloper = {
      fingerprint,
      name,
      email,
      level,
      publicKey,
      addedAt: new Date().toISOString(),
    };

    this.addDeveloper(dev);
    await this.save();

    return dev;
  }

  /**
   * Export developer public key
   */
  exportPublicKey(fingerprint: string): string | undefined {
    const dev = this.developers.get(fingerprint);
    return dev?.publicKey;
  }

  /**
   * Get trust store statistics
   */
  getStats(): {
    total: number;
    official: number;
    verified: number;
    community: number;
  } {
    const developers = this.getAllDevelopers();

    return {
      total: developers.length,
      official: developers.filter((d) => d.level === TrustLevel.OFFICIAL).length,
      verified: developers.filter((d) => d.level === TrustLevel.VERIFIED).length,
      community: developers.filter((d) => d.level === TrustLevel.COMMUNITY).length,
    };
  }

  /**
   * Search developers by name or email
   */
  search(query: string): TrustedDeveloper[] {
    const lowerQuery = query.toLowerCase();

    return this.getAllDevelopers().filter(
      (dev) =>
        dev.name.toLowerCase().includes(lowerQuery) ||
        dev.email?.toLowerCase().includes(lowerQuery) ||
        dev.fingerprint.toLowerCase().includes(lowerQuery)
    );
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultStore: TrustStore | null = null;

/**
 * Get default trust store instance
 */
export async function getDefaultTrustStore(): Promise<TrustStore> {
  if (!defaultStore) {
    defaultStore = new TrustStore();
    await defaultStore.load();
  }

  return defaultStore;
}

/**
 * Clear default trust store (for testing)
 */
export function clearDefaultTrustStore(): void {
  defaultStore = null;
}
