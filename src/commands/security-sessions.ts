/**
 * Session management commands for Phase 2
 */

import { type ActiveSession, getSessionStore } from "../security/session-store.js";
import { formatTokenExpiry } from "../security/token-expiration.js";

export interface SessionsListOptions {
  json?: boolean;
  deviceId?: string;
}

/**
 * List active sessions
 */
export async function listSessions(opts: SessionsListOptions = {}): Promise<void> {
  const store = getSessionStore();
  const sessions = await store.listActiveSessions(opts.deviceId);

  if (opts.json) {
    console.log(JSON.stringify(sessions, null, 2));
    return;
  }

  if (sessions.length === 0) {
    console.log("No active sessions found.");
    return;
  }

  console.log(`\nActive Sessions (${sessions.length}):\n`);
  
  for (const session of sessions) {
    const createdAt = new Date(session.createdAt).toISOString();
    const lastActivity = new Date(session.lastActivity).toISOString();
    const expiry = formatTokenExpiry({
      token: session.token,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    });

    console.log(`Session ID: ${session.sessionId}`);
    if (session.deviceId) {
      console.log(`  Device: ${session.deviceId}`);
    }
    console.log(`  Client: ${session.clientInfo.displayName ?? session.clientInfo.id}`);
    if (session.clientInfo.platform) {
      console.log(`  Platform: ${session.clientInfo.platform}`);
    }
    if (session.clientInfo.version) {
      console.log(`  Version: ${session.clientInfo.version}`);
    }
    console.log(`  Created: ${createdAt}`);
    console.log(`  Last Activity: ${lastActivity}`);
    console.log(`  Expires: ${expiry}`);
    console.log();
  }
}

/**
 * Revoke a session
 */
export async function revokeSession(sessionId: string): Promise<void> {
  const store = getSessionStore();
  
  // Check if session exists
  const session = await store.getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  await store.revokeSession(sessionId);
  console.log(`✓ Session revoked: ${sessionId}`);
  console.log(`  Client: ${session.clientInfo.displayName ?? session.clientInfo.id}`);
}

/**
 * Clean up expired sessions
 */
export async function cleanupSessions(): Promise<void> {
  const store = getSessionStore();
  const removed = await store.cleanupExpiredSessions();
  
  if (removed === 0) {
    console.log("No expired sessions found.");
  } else {
    console.log(`✓ Cleaned up ${removed} expired session(s).`);
  }
}
