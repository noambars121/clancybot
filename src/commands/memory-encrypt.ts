/**
 * Memory Encryption CLI Command
 * 
 * Provides CLI interface for encrypting memory files
 * 
 * Commands:
 * - moltbot memory encrypt - Enable encryption (interactive)
 * - moltbot memory status - Show encryption status
 * - moltbot memory migrate - Migrate existing files
 * 
 * @module commands/memory-encrypt
 */

import { password, confirm, spinner, note, intro, outro } from "@clack/prompts";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { bold, cyan, green, yellow, red, dim } from "kleur/colors";
import {
  validatePassphrase,
  migrateDirectory,
  isFileEncrypted,
  writeFile,
  readFile,
} from "../memory/encryption-at-rest.js";
import { log } from "../logging.js";

// ============================================================================
// Config
// ============================================================================

const MEMORY_DIR = join(homedir(), ".moltbot", "memory");
const ENCRYPTION_CONFIG_FILE = join(homedir(), ".moltbot", ".memory-encryption");

/**
 * Check if memory encryption is enabled
 */
async function isEncryptionEnabled(): Promise<boolean> {
  try {
    const config = await readFile(ENCRYPTION_CONFIG_FILE, "utf8");
    return config.trim() === "enabled";
  } catch {
    return false;
  }
}

/**
 * Enable memory encryption
 */
async function enableEncryption(): Promise<void> {
  await writeFile(ENCRYPTION_CONFIG_FILE, "enabled", { mode: 0o600 });
}

/**
 * Get memory files to encrypt
 */
async function getMemoryFiles(): Promise<string[]> {
  try {
    const files = await readdir(MEMORY_DIR);
    return files
      .filter((f) => f.endsWith(".md") || f.endsWith(".txt"))
      .map((f) => join(MEMORY_DIR, f));
  } catch {
    return [];
  }
}

// ============================================================================
// Commands
// ============================================================================

/**
 * Enable memory encryption (interactive)
 */
export async function encryptCommand(): Promise<void> {
  intro(bold(cyan("🔒 Enable Memory Encryption")));

  // Check if already enabled
  if (await isEncryptionEnabled()) {
    note(
      `${green("✓")} Memory encryption is already enabled.\n\n` +
        `Your memory files are encrypted at rest.\n` +
        `Run ${cyan("moltbot memory status")} to check encryption status.`,
      "Already Enabled",
    );
    return;
  }

  // Explain
  note(
    `Memory encryption protects your conversation history from:\n` +
      `• ${red("Infostealer malware")} (Raccoon, RedLine, Vidar)\n` +
      `• ${red("Physical device theft")}\n` +
      `• ${red("Unauthorized file access")}\n\n` +
      `Your memory files will be encrypted with ${bold("AES-256-GCM")}.\n` +
      `${dim("Files: MEMORY.md, USER.md, conversation history")}`,
    "Why Encrypt?",
  );

  // Get passphrase
  const passphrase1 = await password({
    message: "Enter encryption passphrase (min 8 chars):",
    validate: (value) => {
      if (!value) return "Passphrase is required";
      const validation = validatePassphrase(value);
      if (!validation.valid) {
        return validation.feedback[0] || "Passphrase too weak";
      }
      return undefined;
    },
  });

  if (!passphrase1 || typeof passphrase1 === "symbol") {
    outro(red("Cancelled"));
    return;
  }

  // Confirm passphrase
  const passphrase2 = await password({
    message: "Re-enter passphrase to confirm:",
    validate: (value) => {
      if (value !== passphrase1) {
        return "Passphrases do not match";
      }
      return undefined;
    },
  });

  if (!passphrase2 || typeof passphrase2 === "symbol") {
    outro(red("Cancelled"));
    return;
  }

  // Show passphrase strength
  const strength = validatePassphrase(passphrase1 as string);
  const strengthColor = strength.score >= 80 ? green : strength.score >= 60 ? yellow : red;
  note(
    `Passphrase Strength: ${strengthColor(bold(`${strength.score}/100`))}\n` +
      (strength.feedback.length > 0 ? `\n${dim(strength.feedback.join("\n"))}` : ""),
    "Strength Analysis",
  );

  // Find existing memory files
  const memoryFiles = await getMemoryFiles();

  if (memoryFiles.length === 0) {
    note(
      `${dim("No existing memory files found.")}\n\n` +
        `Memory encryption will be enabled for future files.`,
      "No Files to Migrate",
    );

    // Enable encryption
    await enableEncryption();

    outro(
      green(
        bold(
          `✅ Memory encryption enabled!\n\n` +
            `Future memory files will be encrypted automatically.\n` +
            `${dim(`Run ${cyan("moltbot memory status")} to verify.`)}`,
        ),
      ),
    );
    return;
  }

  // Ask to migrate existing files
  note(
    `Found ${bold(memoryFiles.length.toString())} existing memory files:\n\n` +
      memoryFiles.map((f) => `  • ${dim(f)}`).join("\n"),
    "Existing Files",
  );

  const shouldMigrate = await confirm({
    message: "Encrypt existing memory files now?",
    initialValue: true,
  });

  if (!shouldMigrate || typeof shouldMigrate === "symbol") {
    await enableEncryption();
    outro(
      yellow(
        `Memory encryption enabled (existing files not migrated).\n\n` +
          `Run ${cyan("moltbot memory migrate")} later to encrypt existing files.`,
      ),
    );
    return;
  }

  // Migrate files
  const s = spinner();
  s.start(`Encrypting ${memoryFiles.length} files...`);

  try {
    const result = await migrateDirectory(memoryFiles, passphrase1 as string);

    s.stop(
      `${green("✓")} Encrypted ${result.migrated} files ` +
        (result.skipped > 0 ? `(${result.skipped} already encrypted)` : ""),
    );

    if (result.failed > 0) {
      note(`${red("✗")} Failed to encrypt ${result.failed} files`, "Warning");
    }

    // Enable encryption
    await enableEncryption();

    outro(
      green(
        bold(
          `🎉 Memory encryption complete!\n\n` +
            `✅ Encrypted ${result.migrated} files\n` +
            `✅ Future files will be encrypted automatically\n\n` +
            `${dim("Important:")}\n` +
            `${dim("• Remember your passphrase (cannot be recovered)")}\n` +
            `${dim("• Gateway will prompt for passphrase on startup")}\n` +
            `${dim(`• Run ${cyan("moltbot memory status")} to verify`)}`,
        ),
      ),
    );

    log.info("Memory encryption enabled", { filesEncrypted: result.migrated });
  } catch (err) {
    s.stop(red("Encryption failed"));
    log.error("Memory encryption failed", err);
    outro(red(`Failed to encrypt memory files: ${err instanceof Error ? err.message : String(err)}`));
  }
}

/**
 * Show memory encryption status
 */
export async function statusCommand(): Promise<void> {
  intro(bold(cyan("🔒 Memory Encryption Status")));

  const enabled = await isEncryptionEnabled();

  if (!enabled) {
    note(
      `${red("✗")} Memory encryption is ${bold("DISABLED")}\n\n` +
        `Your memory files are stored in ${red("plaintext")}.\n` +
        `This makes them vulnerable to:\n` +
        `• Infostealer malware\n` +
        `• Physical device theft\n` +
        `• Unauthorized file access\n\n` +
        `${bold("Recommendation:")}\n` +
        `Run ${cyan("moltbot memory encrypt")} to enable encryption.`,
      "Status",
    );
    return;
  }

  // Check existing files
  const memoryFiles = await getMemoryFiles();

  if (memoryFiles.length === 0) {
    note(
      `${green("✓")} Memory encryption is ${bold("ENABLED")}\n\n` +
        `${dim("No memory files found yet.")}\n` +
        `Future files will be encrypted automatically.`,
      "Status",
    );
    return;
  }

  // Check which files are encrypted
  const s = spinner();
  s.start("Checking files...");

  const encryptionStatus = await Promise.all(
    memoryFiles.map(async (file) => ({
      file,
      encrypted: await isFileEncrypted(file),
    })),
  );

  s.stop("Done");

  const encryptedCount = encryptionStatus.filter((s) => s.encrypted).length;
  const plaintextCount = encryptionStatus.length - encryptedCount;

  const statusColor = plaintextCount === 0 ? green : yellow;

  note(
    `${statusColor("●")} Memory encryption: ${bold("ENABLED")}\n\n` +
      `Files found: ${bold(memoryFiles.length.toString())}\n` +
      `• ${green("Encrypted:")} ${encryptedCount}\n` +
      `• ${plaintextCount > 0 ? yellow("Plaintext:") : dim("Plaintext:")} ${plaintextCount}\n\n` +
      (plaintextCount > 0
        ? `${yellow("⚠")} Some files are not encrypted.\n` +
          `Run ${cyan("moltbot memory migrate")} to encrypt them.`
        : `${green("✓")} All files are encrypted.`),
    "Status",
  );
}

/**
 * Migrate existing files to encrypted
 */
export async function migrateCommand(): Promise<void> {
  intro(bold(cyan("🔒 Migrate Memory Files to Encrypted")));

  const enabled = await isEncryptionEnabled();

  if (!enabled) {
    note(
      `${red("✗")} Memory encryption is not enabled.\n\n` +
        `Run ${cyan("moltbot memory encrypt")} first to enable encryption.`,
      "Not Enabled",
    );
    return;
  }

  // Get memory files
  const memoryFiles = await getMemoryFiles();

  if (memoryFiles.length === 0) {
    note(`${dim("No memory files found to migrate.")}`, "No Files");
    return;
  }

  // Check which files need migration
  const s = spinner();
  s.start("Checking files...");

  const fileStatus = await Promise.all(
    memoryFiles.map(async (file) => ({
      file,
      encrypted: await isFileEncrypted(file),
    })),
  );

  s.stop("Done");

  const plaintextFiles = fileStatus.filter((f) => !f.encrypted);

  if (plaintextFiles.length === 0) {
    note(
      `${green("✓")} All ${memoryFiles.length} memory files are already encrypted.\n\n` +
        `${dim("No migration needed.")}`,
      "Already Encrypted",
    );
    return;
  }

  note(
    `Found ${bold(plaintextFiles.length.toString())} plaintext files to encrypt:\n\n` +
      plaintextFiles.map((f) => `  • ${dim(f.file)}`).join("\n"),
    "Files to Migrate",
  );

  const shouldMigrate = await confirm({
    message: `Encrypt ${plaintextFiles.length} files now?`,
    initialValue: true,
  });

  if (!shouldMigrate || typeof shouldMigrate === "symbol") {
    outro(yellow("Migration cancelled"));
    return;
  }

  // Get passphrase
  const passphrase = await password({
    message: "Enter encryption passphrase:",
  });

  if (!passphrase || typeof passphrase === "symbol") {
    outro(red("Cancelled"));
    return;
  }

  // Migrate
  const s2 = spinner();
  s2.start(`Encrypting ${plaintextFiles.length} files...`);

  try {
    const result = await migrateDirectory(
      plaintextFiles.map((f) => f.file),
      passphrase as string,
    );

    s2.stop(`${green("✓")} Migration complete`);

    outro(
      green(
        bold(
          `✅ Encrypted ${result.migrated} files\n` +
            (result.skipped > 0 ? `${dim(`(${result.skipped} already encrypted)`)}` : "") +
            (result.failed > 0 ? `\n${red(`✗ ${result.failed} failed`)}` : ""),
        ),
      ),
    );
  } catch (err) {
    s2.stop(red("Migration failed"));
    outro(red(`Failed: ${err instanceof Error ? err.message : String(err)}`));
  }
}

// ============================================================================
// Export
// ============================================================================

export const memoryCommands = {
  encrypt: encryptCommand,
  status: statusCommand,
  migrate: migrateCommand,
};
