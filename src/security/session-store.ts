/**
 * Active session tracking for Phase 2 session management
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";
import { resolveStateDir } from "../config/paths.js";

export interface ActiveSession {
  sessionId: string;
  deviceId?: string;
  token: string; // Gateway auth token (for validation)
  createdAt: number; // Unix timestamp (ms)
  lastActivity: number; // Unix timestamp (ms)
  expiresAt: number; // Unix timestamp (ms)
  clientInfo: {
    id: string;
    platform?: string;
    version?: string;
    displayName?: string;
  };
}

interface SessionStoreData {
  sessions: Record<string, ActiveSession>;
}

/**
 * Session store for tracking active gateway sessions
 */
export class SessionStore {
  private storePath: string;
  private sessions: Map<string, ActiveSession> = new Map();
  private loaded = false;

  constructor() {
    this.storePath = join(resolveStateDir(), "sessions.json");
  }

  /**
   * Load sessions from disk (lazy)
   */
  private async load(): Promise<void> {
    if (this.loaded) return;

    try {
      const data = await fs.readFile(this.storePath, "utf-8");
      const parsed = JSON.parse(data) as SessionStoreData;
      
      // Load only non-expired sessions
      const now = Date.now();
      for (const [id, session] of Object.entries(parsed.sessions)) {
        if (session.expiresAt > now) {
          this.sessions.set(id, session);
        }
      }
    } catch (error) {
      // File doesn't exist or is invalid - start fresh
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(`Failed to load session store: ${String(error)}`);
      }
    }

    this.loaded = true;
  }

  /**
   * Save sessions to disk
   */
  private async save(): Promise<void> {
    const data: SessionStoreData = {
      sessions: Object.fromEntries(this.sessions.entries()),
    };

    try {
      await fs.writeFile(this.storePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
      console.error(`Failed to save session store: ${String(error)}`);
    }
  }

  /**
   * Register a new session
   */
  async registerSession(session: ActiveSession): Promise<void> {
    await this.load();
    
    // Check max sessions per device
    if (session.deviceId) {
      const deviceSessions = Array.from(this.sessions.values()).filter(
        (s) => s.deviceId === session.deviceId,
      );
      
      // Remove oldest session if limit exceeded (configurable, default 10)
      const maxSessionsPerDevice = 10;
      if (deviceSessions.length >= maxSessionsPerDevice) {
        const oldest = deviceSessions.sort((a, b) => a.createdAt - b.createdAt)[0];
        if (oldest) {
          this.sessions.delete(oldest.sessionId);
        }
      }
    }

    this.sessions.set(session.sessionId, session);
    await this.save();
  }

  /**
   * Get a session by ID
   */
  async getSession(sessionId: string): Promise<ActiveSession | null> {
    await this.load();
    
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    
    // Check if expired
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(sessionId);
      await this.save();
      return null;
    }
    
    return session;
  }

  /**
   * Update last activity timestamp
   */
  async updateLastActivity(sessionId: string): Promise<void> {
    await this.load();
    
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
      // Note: We don't save on every activity update (too expensive)
      // Save happens on registration, revocation, and cleanup
    }
  }

  /**
   * Revoke a session
   */
  async revokeSession(sessionId: string): Promise<void> {
    await this.load();
    
    this.sessions.delete(sessionId);
    await this.save();
  }

  /**
   * List active sessions (optionally filtered by device)
   */
  async listActiveSessions(deviceId?: string): Promise<ActiveSession[]> {
    await this.load();
    
    const now = Date.now();
    const sessions = Array.from(this.sessions.values()).filter((s) => {
      // Filter expired
      if (s.expiresAt <= now) return false;
      
      // Filter by device if specified
      if (deviceId && s.deviceId !== deviceId) return false;
      
      return true;
    });
    
    // Sort by last activity (most recent first)
    return sessions.sort((a, b) => b.lastActivity - a.lastActivity);
  }

  /**
   * Clean up expired sessions
   * @returns Number of sessions cleaned up
   */
  async cleanupExpiredSessions(): Promise<number> {
    await this.load();
    
    const now = Date.now();
    const before = this.sessions.size;
    
    for (const [id, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(id);
      }
    }
    
    const removed = before - this.sessions.size;
    if (removed > 0) {
      await this.save();
    }
    
    return removed;
  }
}

// Global session store instance
let globalStore: SessionStore | null = null;

/**
 * Get the global session store instance
 */
export function getSessionStore(): SessionStore {
  if (!globalStore) {
    globalStore = new SessionStore();
  }
  return globalStore;
}
