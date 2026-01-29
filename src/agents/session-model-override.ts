/**
 * Session Model Override Management - Phase 5 Fix
 * 
 * Prevents model switching issues by managing session-level model overrides.
 * Addresses GitHub Issue #3370: Runtime not updated when switching models
 * 
 * Problem:
 * - Session store can override model: session.model = { provider, model }
 * - This override persists even when config changes
 * - User switches to Gemini in config → session still uses Claude
 * 
 * Solution:
 * - Provide functions to clear session model overrides
 * - Use when permanently switching models
 */

import type { MoltbotConfig } from "../config/config.js";
import {
  loadSessionStore,
  resolveStorePath,
  updateSessionStore,
  type SessionEntry,
} from "../config/sessions.js";
import { getChildLogger } from "../logging/logger.js";

const log = getChildLogger({ module: "session-model-override" });

export interface ModelOverride {
  provider: string;
  model: string;
}

/**
 * Check if a session has a model override
 */
export function hasSessionModelOverride(
  session: SessionEntry | undefined,
): boolean {
  if (!session || !session.model) return false;
  return typeof session.model === "object" && Boolean(session.model.provider || session.model.model);
}

/**
 * Get session model override if present
 */
export function getSessionModelOverride(
  session: SessionEntry | undefined,
): ModelOverride | null {
  if (!hasSessionModelOverride(session)) return null;
  
  const model = session!.model;
  if (!model || typeof model !== "object") return null;
  
  const provider = (model as { provider?: string }).provider;
  const modelId = (model as { model?: string }).model;
  
  if (!provider || !modelId) return null;
  
  return { provider, model: modelId };
}

/**
 * Clear model override for a specific session
 */
export async function clearSessionModelOverride(
  cfg: MoltbotConfig,
  sessionKey: string,
): Promise<{ cleared: boolean; previousOverride?: ModelOverride }> {
  const storePath = resolveStorePath(cfg.session?.store);
  const store = loadSessionStore(storePath);
  const entry = store[sessionKey];
  
  const previousOverride = getSessionModelOverride(entry);
  
  if (!previousOverride) {
    log.debug(`No model override to clear for session ${sessionKey}`);
    return { cleared: false };
  }
  
  await updateSessionStore(storePath, (store) => {
    const entry = store[sessionKey];
    if (entry?.model) {
      delete entry.model;
      log.info(
        `Cleared model override for session ${sessionKey}: ` +
        `${previousOverride.provider}/${previousOverride.model}`
      );
    }
  });
  
  return { cleared: true, previousOverride };
}

/**
 * Clear model overrides for all sessions
 */
export async function clearAllSessionModelOverrides(
  cfg: MoltbotConfig,
): Promise<{ clearedCount: number; sessions: string[] }> {
  const storePath = resolveStorePath(cfg.session?.store);
  const store = loadSessionStore(storePath);
  
  const sessionsWithOverrides: string[] = [];
  
  for (const [sessionKey, entry] of Object.entries(store)) {
    if (hasSessionModelOverride(entry)) {
      sessionsWithOverrides.push(sessionKey);
    }
  }
  
  if (sessionsWithOverrides.length === 0) {
    log.debug("No session model overrides to clear");
    return { clearedCount: 0, sessions: [] };
  }
  
  await updateSessionStore(storePath, (store) => {
    for (const sessionKey of sessionsWithOverrides) {
      const entry = store[sessionKey];
      if (entry?.model) {
        delete entry.model;
      }
    }
  });
  
  log.info(`Cleared model overrides for ${sessionsWithOverrides.length} sessions`);
  return { clearedCount: sessionsWithOverrides.length, sessions: sessionsWithOverrides };
}

/**
 * Set model override for a specific session
 */
export async function setSessionModelOverride(
  cfg: MoltbotConfig,
  sessionKey: string,
  override: ModelOverride,
): Promise<void> {
  const storePath = resolveStorePath(cfg.session?.store);
  
  await updateSessionStore(storePath, (store) => {
    const entry = store[sessionKey] || {};
    entry.model = {
      provider: override.provider,
      model: override.model,
    };
    store[sessionKey] = entry;
  });
  
  log.info(
    `Set model override for session ${sessionKey}: ${override.provider}/${override.model}`
  );
}

/**
 * List all sessions with model overrides
 */
export function listSessionModelOverrides(
  cfg: MoltbotConfig,
): Array<{ sessionKey: string; override: ModelOverride }> {
  const storePath = resolveStorePath(cfg.session?.store);
  const store = loadSessionStore(storePath);
  
  const result: Array<{ sessionKey: string; override: ModelOverride }> = [];
  
  for (const [sessionKey, entry] of Object.entries(store)) {
    const override = getSessionModelOverride(entry);
    if (override) {
      result.push({ sessionKey, override });
    }
  }
  
  return result;
}
