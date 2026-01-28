import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";

export interface AuthAuditEvent {
  timestamp: number;
  clientIp: string;
  method: 'token' | 'password' | 'tailscale' | 'device-token';
  success: boolean;
  reason?: string;
  userId?: string;
}

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_LOG_FILES = 5;

async function ensureLogDir(): Promise<string> {
  const logDir = path.join(resolveStateDir(), 'logs');
  await fs.mkdir(logDir, { recursive: true, mode: 0o700 });
  return logDir;
}

async function getLogPath(): Promise<string> {
  const logDir = await ensureLogDir();
  return path.join(logDir, 'auth-audit.jsonl');
}

async function rotateLogIfNeeded(logPath: string): Promise<void> {
  try {
    const stats = await fs.stat(logPath);
    if (stats.size < MAX_LOG_SIZE) return;

    // Rotate logs: auth-audit.jsonl -> auth-audit.jsonl.1 -> ... -> auth-audit.jsonl.5
    for (let i = MAX_LOG_FILES - 1; i > 0; i--) {
      const oldPath = `${logPath}.${i}`;
      const newPath = `${logPath}.${i + 1}`;
      try {
        await fs.rename(oldPath, newPath);
      } catch {
        // File doesn't exist, skip
      }
    }

    // Move current log to .1
    await fs.rename(logPath, `${logPath}.1`);
  } catch {
    // Log file doesn't exist yet
  }
}

export async function logAuthEvent(event: AuthAuditEvent): Promise<void> {
  try {
    const logPath = await getLogPath();
    await rotateLogIfNeeded(logPath);
    
    const line = JSON.stringify(event) + '\n';
    await fs.appendFile(logPath, line, { mode: 0o600 });
  } catch (error) {
    // Don't fail auth on logging errors
    console.error('Failed to log auth event:', error);
  }
}

export async function getRecentAuthEvents(limit = 100): Promise<AuthAuditEvent[]> {
  try {
    const logPath = await getLogPath();
    const content = await fs.readFile(logPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const events = lines
      .slice(-limit)
      .map(line => JSON.parse(line) as AuthAuditEvent);
    return events.reverse(); // Most recent first
  } catch {
    return [];
  }
}
