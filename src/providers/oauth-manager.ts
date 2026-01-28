/**
 * OAuth Token Manager - Phase 4 Fix
 * 
 * Prevents OAuth race conditions when multiple apps share tokens.
 * Addresses GitHub Issue #2036:
 * - Claude Code refreshes OAuth → Moltbot's token invalid
 * - Must re-login manually
 * 
 * Solution:
 * - Token coordination (lock file)
 * - Stale token detection
 * - Auto re-login flow
 * - Retry with backoff
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getChildLogger } from "../logging/logger.js";
import { resolveStateDir } from "../config/state-dir.js";

const log = getChildLogger("oauth-manager");

export interface OAuthToken {
  access: string;
  refresh?: string;
  expires?: number; // Unix timestamp (ms)
  provider: string;
  profile?: string;
}

export interface OAuthRefreshResult {
  token: OAuthToken;
  refreshed: boolean;
  reason?: string;
}

export type OAuthRefreshFunction = (token: OAuthToken) => Promise<OAuthToken>;

/**
 * OAuth Token Manager
 * Coordinates token refresh across multiple processes
 */
export class OAuthTokenManager {
  private lockDir: string;
  private tokenCacheDir: string;
  
  constructor() {
    const stateDir = resolveStateDir();
    this.lockDir = path.join(stateDir, "oauth-locks");
    this.tokenCacheDir = path.join(stateDir, "oauth-tokens");
    
    // Ensure directories exist
    fs.mkdirSync(this.lockDir, { recursive: true, mode: 0o700 });
    fs.mkdirSync(this.tokenCacheDir, { recursive: true, mode: 0o600 });
  }
  
  /**
   * Get or refresh an OAuth token
   * Handles coordination across multiple processes
   */
  async getToken(
    token: OAuthToken,
    refreshFn: OAuthRefreshFunction,
    options?: {
      forceRefresh?: boolean;
      expiryBufferMs?: number; // Refresh this many ms before actual expiry
    },
  ): Promise<OAuthRefreshResult> {
    const expiryBuffer = options?.expiryBufferMs ?? 5 * 60 * 1000; // 5 minutes default
    
    // Check if token is still valid
    if (!options?.forceRefresh && this.isTokenValid(token, expiryBuffer)) {
      log.debug(`Token valid for ${token.provider}/${token.profile || "default"}`);
      return { token, refreshed: false };
    }
    
    // Token needs refresh - acquire lock
    const lockKey = this.getLockKey(token);
    const acquired = await this.acquireLock(lockKey);
    
    if (!acquired) {
      // Another process is refreshing - wait and retry
      log.debug(`Lock held by another process, waiting... (${lockKey})`);
      await this.sleep(1000);
      
      // Check if refresh completed
      const cached = await this.getCachedToken(token);
      if (cached && this.isTokenValid(cached, expiryBuffer)) {
        log.info(`Token refreshed by another process (${lockKey})`);
        return { token: cached, refreshed: true, reason: "refreshed-by-other-process" };
      }
      
      // Still invalid - try to acquire lock again
      return await this.getToken(token, refreshFn, options);
    }
    
    try {
      // We have the lock - refresh the token
      log.info(`Refreshing OAuth token for ${token.provider}/${token.profile || "default"}`);
      
      // Double-check cache (another process may have refreshed while we waited)
      const cached = await this.getCachedToken(token);
      if (cached && this.isTokenValid(cached, expiryBuffer)) {
        log.info(`Token already refreshed (${lockKey})`);
        return { token: cached, refreshed: true, reason: "already-refreshed" };
      }
      
      // Perform refresh
      const refreshed = await refreshFn(token);
      
      // Cache the new token
      await this.cacheToken(refreshed);
      
      log.info(`Token refreshed successfully (${lockKey})`);
      return { token: refreshed, refreshed: true, reason: "refreshed-now" };
    } catch (error) {
      log.error(`Token refresh failed (${lockKey}):`, error);
      throw error;
    } finally {
      // Always release lock
      await this.releaseLock(lockKey);
    }
  }
  
  /**
   * Check if a token is still valid
   */
  isTokenValid(token: OAuthToken, expiryBufferMs: number = 0): boolean {
    if (!token.access?.trim()) {
      return false;
    }
    
    if (token.expires === undefined) {
      // No expiry info - assume valid (caller should handle 401)
      return true;
    }
    
    const now = Date.now();
    const expiresAt = token.expires - expiryBufferMs;
    
    if (now >= expiresAt) {
      log.debug(`Token expired: now=${now}, expires=${token.expires}`);
      return false;
    }
    
    return true;
  }
  
  /**
   * Get cached token if available
   */
  private async getCachedToken(token: OAuthToken): Promise<OAuthToken | null> {
    const cacheKey = this.getCacheKey(token);
    const cachePath = path.join(this.tokenCacheDir, `${cacheKey}.json`);
    
    try {
      if (!fs.existsSync(cachePath)) {
        return null;
      }
      
      const data = await fs.promises.readFile(cachePath, "utf-8");
      const cached = JSON.parse(data) as OAuthToken;
      
      return cached;
    } catch (error) {
      log.debug(`Failed to read cached token: ${error}`);
      return null;
    }
  }
  
  /**
   * Cache a token to disk
   */
  private async cacheToken(token: OAuthToken): Promise<void> {
    const cacheKey = this.getCacheKey(token);
    const cachePath = path.join(this.tokenCacheDir, `${cacheKey}.json`);
    
    try {
      await fs.promises.writeFile(cachePath, JSON.stringify(token, null, 2), {
        mode: 0o600,
      });
      log.debug(`Token cached: ${cachePath}`);
    } catch (error) {
      log.warn(`Failed to cache token: ${error}`);
    }
  }
  
  /**
   * Acquire a lock for token refresh
   * Returns true if acquired, false if another process holds it
   */
  private async acquireLock(lockKey: string): Promise<boolean> {
    const lockPath = path.join(this.lockDir, `${lockKey}.lock`);
    
    try {
      // Try to create lock file (exclusive)
      // If file exists, this will fail
      await fs.promises.writeFile(
        lockPath,
        JSON.stringify({
          pid: process.pid,
          timestamp: Date.now(),
        }),
        {
          flag: "wx", // Exclusive create - fails if exists
          mode: 0o600,
        },
      );
      
      log.debug(`Lock acquired: ${lockPath}`);
      return true;
    } catch (error: any) {
      if (error.code === "EEXIST") {
        // Lock file exists - check if stale
        const isStale = await this.isLockStale(lockPath);
        if (isStale) {
          // Remove stale lock and try again
          await fs.promises.unlink(lockPath).catch(() => {});
          return await this.acquireLock(lockKey);
        }
        return false;
      }
      
      log.warn(`Failed to acquire lock: ${error}`);
      return false;
    }
  }
  
  /**
   * Release a lock
   */
  private async releaseLock(lockKey: string): Promise<void> {
    const lockPath = path.join(this.lockDir, `${lockKey}.lock`);
    
    try {
      await fs.promises.unlink(lockPath);
      log.debug(`Lock released: ${lockPath}`);
    } catch (error) {
      log.warn(`Failed to release lock: ${error}`);
    }
  }
  
  /**
   * Check if a lock is stale (older than 60 seconds)
   */
  private async isLockStale(lockPath: string): Promise<boolean> {
    try {
      const data = await fs.promises.readFile(lockPath, "utf-8");
      const lock = JSON.parse(data) as { timestamp: number };
      
      const age = Date.now() - lock.timestamp;
      const isStale = age > 60_000; // 60 seconds
      
      if (isStale) {
        log.warn(`Stale lock detected (age=${age}ms): ${lockPath}`);
      }
      
      return isStale;
    } catch {
      return true; // If we can't read it, assume stale
    }
  }
  
  /**
   * Get lock key for a token
   */
  private getLockKey(token: OAuthToken): string {
    const key = `${token.provider}-${token.profile || "default"}`;
    return this.hashKey(key);
  }
  
  /**
   * Get cache key for a token
   */
  private getCacheKey(token: OAuthToken): string {
    return this.getLockKey(token);
  }
  
  /**
   * Hash a key (for safe filesystem names)
   */
  private hashKey(key: string): string {
    return crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
  }
  
  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Global singleton instance
 */
let globalManager: OAuthTokenManager | null = null;

export function getOAuthTokenManager(): OAuthTokenManager {
  if (!globalManager) {
    globalManager = new OAuthTokenManager();
  }
  return globalManager;
}

/**
 * Detect if an error is an OAuth authentication error
 */
export function isOAuthAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  
  const message = (error as { message?: string }).message?.toLowerCase() || "";
  const status = (error as { status?: number; statusCode?: number }).status ?? (error as { status?: number; statusCode?: number }).statusCode;
  
  // Check for 401 Unauthorized
  if (status === 401) return true;
  
  // Check for common OAuth error messages
  const oauthErrors = [
    "invalid_token",
    "token expired",
    "token invalid",
    "authentication failed",
    "oauth",
    "unauthorized",
  ];
  
  return oauthErrors.some((err) => message.includes(err));
}

/**
 * Retry function with OAuth token refresh
 */
export async function retryWithOAuthRefresh<T>(
  fn: () => Promise<T>,
  token: OAuthToken,
  refreshFn: OAuthRefreshFunction,
  options?: {
    maxRetries?: number;
    onTokenRefreshed?: (newToken: OAuthToken) => void;
  },
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 2;
  const manager = getOAuthTokenManager();
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      // Check if it's an OAuth error
      if (!isOAuthAuthError(error)) {
        throw error; // Not an OAuth error - rethrow
      }
      
      if (attempt >= maxRetries) {
        log.error(`OAuth retry exhausted after ${maxRetries} attempts`);
        throw error;
      }
      
      // Try to refresh token
      log.info(`OAuth error detected, refreshing token (attempt ${attempt + 1}/${maxRetries})`);
      
      try {
        const result = await manager.getToken(token, refreshFn, {
          forceRefresh: true,
        });
        
        // Notify caller of new token
        if (options?.onTokenRefreshed) {
          options.onTokenRefreshed(result.token);
        }
        
        // Update token reference
        Object.assign(token, result.token);
      } catch (refreshError) {
        log.error(`Token refresh failed: ${refreshError}`);
        throw error; // Original error
      }
    }
  }
  
  throw new Error("Unreachable");
}
