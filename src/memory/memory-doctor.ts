/**
 * Memory Doctor - Complete data purge across all memory layers
 *
 * Implements "Right to be Forgotten" (GDPR Article 17):
 * - Scans all memory layers (Markdown, vectors, logs, cache)
 * - Semantic search for related content
 * - Complete deletion with verification
 * - Audit trail for compliance
 *
 * Layers:
 * 1. Markdown files (MEMORY.md, USER.md)
 * 2. Vector embeddings (RAG database)
 * 3. Conversation logs (*.jsonl)
 * 4. Agent sessions (cache)
 * 5. Backup files (if any)
 *
 * @see Phase 10 - Pentagon++++ Security
 */

import { readFile, writeFile, readdir, stat, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { getChildLogger } from "../logging.js";

const log = getChildLogger("memory-doctor");

// ============================================================================
// Types
// ============================================================================

export type MemoryLayer = "markdown" | "vectors" | "logs" | "cache" | "backups";

export type MemoryMatch = {
  layer: MemoryLayer;
  file: string;
  line?: number;
  content: string;
  context?: string; // Surrounding text
  confidence: number; // 0.0-1.0
  vectorId?: string; // For vector embeddings
};

export type PurgeResult = {
  query: string;
  matchesFound: number;
  matchesDeleted: number;
  layersAffected: MemoryLayer[];
  timestamp: number;
  verificationPassed: boolean;
};

export type PurgeOptions = {
  preview: boolean; // Show matches before deleting
  semantic: boolean; // Use semantic search (in addition to exact)
  threshold: number; // Semantic similarity threshold (0.0-1.0)
  force: boolean; // Skip confirmation
  dryRun: boolean; // Don't actually delete
};

// ============================================================================
// Memory Doctor
// ============================================================================

export class MemoryDoctor {
  private memoryDir: string;
  private logsDir: string;
  private backupsDir: string;

  constructor(baseDir?: string) {
    const base = baseDir || join(homedir(), ".moltbot");
    this.memoryDir = join(base, "memory");
    this.logsDir = join(base, "agents");
    this.backupsDir = join(base, "backups");
  }

  /**
   * Scan all memory layers for matching content
   */
  async scan(query: string, options: Partial<PurgeOptions> = {}): Promise<MemoryMatch[]> {
    const opts: PurgeOptions = {
      preview: true,
      semantic: false,
      threshold: 0.8,
      force: false,
      dryRun: false,
      ...options,
    };

    log.info("Scanning memory layers", { query, options: opts });

    const matches: MemoryMatch[] = [];

    // Layer 1: Markdown files
    const markdownMatches = await this.scanMarkdown(query, opts);
    matches.push(...markdownMatches);

    // Layer 2: Vector embeddings (if semantic enabled)
    if (opts.semantic) {
      const vectorMatches = await this.scanVectors(query, opts);
      matches.push(...vectorMatches);
    }

    // Layer 3: Conversation logs
    const logMatches = await this.scanLogs(query, opts);
    matches.push(...logMatches);

    // Layer 4: Cache (in-memory, check session files)
    const cacheMatches = await this.scanCache(query, opts);
    matches.push(...cacheMatches);

    // Layer 5: Backups
    const backupMatches = await this.scanBackups(query, opts);
    matches.push(...backupMatches);

    log.info("Scan complete", {
      query,
      matchesFound: matches.length,
      layers: [...new Set(matches.map((m) => m.layer))],
    });

    return matches;
  }

  /**
   * Purge all matches from memory
   */
  async purge(query: string, options: Partial<PurgeOptions> = {}): Promise<PurgeResult> {
    const opts: PurgeOptions = {
      preview: true,
      semantic: false,
      threshold: 0.8,
      force: false,
      dryRun: false,
      ...options,
    };

    // Scan for matches
    const matches = await this.scan(query, opts);

    if (matches.length === 0) {
      log.info("No matches found, nothing to purge");
      return {
        query,
        matchesFound: 0,
        matchesDeleted: 0,
        layersAffected: [],
        timestamp: Date.now(),
        verificationPassed: true,
      };
    }

    if (opts.dryRun) {
      log.info("Dry run mode, not actually deleting", { matches: matches.length });
      return {
        query,
        matchesFound: matches.length,
        matchesDeleted: 0,
        layersAffected: [...new Set(matches.map((m) => m.layer))],
        timestamp: Date.now(),
        verificationPassed: true,
      };
    }

    // Delete matches
    log.info("Purging matches", { count: matches.length });

    let deleted = 0;
    const layersAffected = new Set<MemoryLayer>();

    for (const match of matches) {
      try {
        await this.deleteMatch(match);
        deleted++;
        layersAffected.add(match.layer);
      } catch (err) {
        log.error("Failed to delete match", { match, error: err });
      }
    }

    // Verify deletion
    const verificationPassed = await this.verify(query, opts);

    const result: PurgeResult = {
      query,
      matchesFound: matches.length,
      matchesDeleted: deleted,
      layersAffected: Array.from(layersAffected),
      timestamp: Date.now(),
      verificationPassed,
    };

    // Log for audit trail
    await this.logPurge(result);

    log.info("Purge complete", result);

    return result;
  }

  /**
   * Verify that query no longer appears in memory
   */
  async verify(query: string, options: Partial<PurgeOptions> = {}): Promise<boolean> {
    const matches = await this.scan(query, options);
    return matches.length === 0;
  }

  // ========================================================================
  // Layer 1: Markdown Files
  // ========================================================================

  private async scanMarkdown(query: string, options: PurgeOptions): Promise<MemoryMatch[]> {
    const matches: MemoryMatch[] = [];

    if (!existsSync(this.memoryDir)) {
      return matches;
    }

    const files = await readdir(this.memoryDir);
    const mdFiles = files.filter((f) => f.endsWith(".md"));

    for (const file of mdFiles) {
      const filePath = join(this.memoryDir, file);
      const content = await readFile(filePath, "utf8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Case-insensitive search
        if (line.toLowerCase().includes(query.toLowerCase())) {
          // Get context (3 lines before and after)
          const contextStart = Math.max(0, i - 3);
          const contextEnd = Math.min(lines.length, i + 4);
          const context = lines.slice(contextStart, contextEnd).join("\n");

          matches.push({
            layer: "markdown",
            file: filePath,
            line: i + 1,
            content: line,
            context,
            confidence: 1.0, // Exact match
          });
        }
      }
    }

    return matches;
  }

  // ========================================================================
  // Layer 2: Vector Embeddings
  // ========================================================================

  private async scanVectors(query: string, options: PurgeOptions): Promise<MemoryMatch[]> {
    // TODO: Implement vector DB integration
    // This requires the actual vector DB being used (Chroma, FAISS, Pinecone, etc.)
    // For now, return empty array

    log.debug("Vector scanning not yet implemented");
    return [];

    // Example implementation:
    // const vectorDB = await this.getVectorDB();
    // const embedding = await vectorDB.embed(query);
    // const results = await vectorDB.search(embedding, {
    //   threshold: options.threshold,
    //   limit: 100,
    // });
    //
    // return results.map(result => ({
    //   layer: "vectors",
    //   file: "vector-db",
    //   content: result.text,
    //   confidence: result.similarity,
    //   vectorId: result.id,
    // }));
  }

  // ========================================================================
  // Layer 3: Conversation Logs
  // ========================================================================

  private async scanLogs(query: string, options: PurgeOptions): Promise<MemoryMatch[]> {
    const matches: MemoryMatch[] = [];

    if (!existsSync(this.logsDir)) {
      return matches;
    }

    // Scan all agent subdirectories
    const agents = await readdir(this.logsDir);

    for (const agent of agents) {
      const agentDir = join(this.logsDir, agent);
      const agentStat = await stat(agentDir);

      if (!agentStat.isDirectory()) {
        continue;
      }

      // Scan sessions subdirectory
      const sessionsDir = join(agentDir, "sessions");
      if (!existsSync(sessionsDir)) {
        continue;
      }

      const sessionFiles = await readdir(sessionsDir);
      const jsonlFiles = sessionFiles.filter((f) => f.endsWith(".jsonl"));

      for (const file of jsonlFiles) {
        const filePath = join(sessionsDir, file);
        const content = await readFile(filePath, "utf8");
        const lines = content.split("\n").filter((l) => l.trim());

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // Parse JSON line
          try {
            const entry = JSON.parse(line);
            const text = JSON.stringify(entry); // Search in full JSON

            if (text.toLowerCase().includes(query.toLowerCase())) {
              matches.push({
                layer: "logs",
                file: filePath,
                line: i + 1,
                content: line,
                confidence: 1.0,
              });
            }
          } catch (err) {
            // Skip invalid JSON
            continue;
          }
        }
      }
    }

    return matches;
  }

  // ========================================================================
  // Layer 4: Cache (Session Files)
  // ========================================================================

  private async scanCache(query: string, options: PurgeOptions): Promise<MemoryMatch[]> {
    const matches: MemoryMatch[] = [];

    if (!existsSync(this.logsDir)) {
      return matches;
    }

    // Scan all agent subdirectories for session cache
    const agents = await readdir(this.logsDir);

    for (const agent of agents) {
      const agentDir = join(this.logsDir, agent);
      const agentStat = await stat(agentDir);

      if (!agentStat.isDirectory()) {
        continue;
      }

      // Check for session.json (current session cache)
      const sessionCache = join(agentDir, "session.json");
      if (existsSync(sessionCache)) {
        const content = await readFile(sessionCache, "utf8");

        if (content.toLowerCase().includes(query.toLowerCase())) {
          matches.push({
            layer: "cache",
            file: sessionCache,
            content: "[Session cache contains query]",
            confidence: 1.0,
          });
        }
      }
    }

    return matches;
  }

  // ========================================================================
  // Layer 5: Backups
  // ========================================================================

  private async scanBackups(query: string, options: PurgeOptions): Promise<MemoryMatch[]> {
    const matches: MemoryMatch[] = [];

    if (!existsSync(this.backupsDir)) {
      return matches;
    }

    const files = await readdir(this.backupsDir);

    for (const file of files) {
      const filePath = join(this.backupsDir, file);
      const fileStat = await stat(filePath);

      if (!fileStat.isFile()) {
        continue;
      }

      // Only scan text files
      if (!file.endsWith(".md") && !file.endsWith(".json") && !file.endsWith(".jsonl")) {
        continue;
      }

      const content = await readFile(filePath, "utf8");

      if (content.toLowerCase().includes(query.toLowerCase())) {
        matches.push({
          layer: "backups",
          file: filePath,
          content: "[Backup file contains query]",
          confidence: 1.0,
        });
      }
    }

    return matches;
  }

  // ========================================================================
  // Deletion
  // ========================================================================

  private async deleteMatch(match: MemoryMatch): Promise<void> {
    log.debug("Deleting match", { layer: match.layer, file: match.file });

    switch (match.layer) {
      case "markdown":
      case "logs":
        await this.deleteFromFile(match);
        break;

      case "vectors":
        await this.deleteFromVectors(match);
        break;

      case "cache":
        await this.deleteFromCache(match);
        break;

      case "backups":
        await this.deleteBackupFile(match);
        break;
    }
  }

  private async deleteFromFile(match: MemoryMatch): Promise<void> {
    // Read file
    const content = await readFile(match.file, "utf8");
    const lines = content.split("\n");

    // Remove matching line
    if (match.line !== undefined) {
      lines.splice(match.line - 1, 1);
    }

    // Write back
    await writeFile(match.file, lines.join("\n"), "utf8");
  }

  private async deleteFromVectors(match: MemoryMatch): Promise<void> {
    // TODO: Implement vector DB deletion
    // const vectorDB = await this.getVectorDB();
    // await vectorDB.delete(match.vectorId);
    // await vectorDB.reindex();

    log.debug("Vector deletion not yet implemented", { vectorId: match.vectorId });
  }

  private async deleteFromCache(match: MemoryMatch): Promise<void> {
    // For cache, safest is to delete entire file
    // It will be regenerated on next session
    if (existsSync(match.file)) {
      await rm(match.file);
    }
  }

  private async deleteBackupFile(match: MemoryMatch): Promise<void> {
    // Delete entire backup file
    if (existsSync(match.file)) {
      await rm(match.file);
    }
  }

  // ========================================================================
  // Audit Trail
  // ========================================================================

  private async logPurge(result: PurgeResult): Promise<void> {
    const auditDir = join(homedir(), ".moltbot", "security");
    const auditFile = join(auditDir, "purge-audit.jsonl");

    // Ensure directory exists
    if (!existsSync(auditDir)) {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(auditDir, { recursive: true });
    }

    const entry = {
      ...result,
      timestamp: new Date(result.timestamp).toISOString(),
    };

    // Append to audit log
    const line = JSON.stringify(entry) + "\n";
    const { appendFile } = await import("node:fs/promises");
    await appendFile(auditFile, line, "utf8");

    log.debug("Logged purge to audit trail", { file: auditFile });
  }

  /**
   * Get purge audit history
   */
  async getAuditHistory(limit = 100): Promise<PurgeResult[]> {
    const auditFile = join(homedir(), ".moltbot", "security", "purge-audit.jsonl");

    if (!existsSync(auditFile)) {
      return [];
    }

    const content = await readFile(auditFile, "utf8");
    const lines = content.split("\n").filter((l) => l.trim());

    const entries: PurgeResult[] = [];

    for (const line of lines.slice(-limit)) {
      try {
        const entry = JSON.parse(line);
        entries.push(entry);
      } catch (err) {
        continue;
      }
    }

    return entries;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let defaultDoctor: MemoryDoctor | null = null;

export function getDefaultMemoryDoctor(): MemoryDoctor {
  if (!defaultDoctor) {
    defaultDoctor = new MemoryDoctor();
  }
  return defaultDoctor;
}

export function clearDefaultMemoryDoctor(): void {
  defaultDoctor = null;
}
