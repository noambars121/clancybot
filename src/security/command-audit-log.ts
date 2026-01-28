import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";

export interface CommandAuditEvent {
  timestamp: number;
  sessionKey: string;
  userId?: string;
  command: string;
  sandbox: boolean;
  elevated: boolean;
  approved: boolean;
  exitCode?: number;
  duration?: number;
}

async function ensureLogDir(): Promise<string> {
  const logDir = path.join(resolveStateDir(), 'logs');
  await fs.mkdir(logDir, { recursive: true, mode: 0o700 });
  return logDir;
}

async function getLogPath(): Promise<string> {
  const logDir = await ensureLogDir();
  return path.join(logDir, 'command-audit.jsonl');
}

export async function logCommand(event: CommandAuditEvent): Promise<void> {
  try {
    const logPath = await getLogPath();
    const line = JSON.stringify(event) + '\n';
    await fs.appendFile(logPath, line, { mode: 0o600 });
  } catch (error) {
    // Don't fail command execution on logging errors
    console.error('Failed to log command:', error);
  }
}

export async function getRecentCommands(limit = 100): Promise<CommandAuditEvent[]> {
  try {
    const logPath = await getLogPath();
    const content = await fs.readFile(logPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    return lines.slice(-limit).map(line => JSON.parse(line) as CommandAuditEvent);
  } catch {
    return [];
  }
}
