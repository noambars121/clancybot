import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveConfigPath, resolveStateDir } from "../config/paths.js";

export interface PermissionIssue {
  path: string;
  current: string;
  expected: string;
  problem: string;
}

const EXPECTED_DIR_MODE = 0o700;
const EXPECTED_FILE_MODE = 0o600;

async function getPermissionMode(filePath: string): Promise<number> {
  try {
    const stats = await fs.stat(filePath);
    return stats.mode & 0o777;
  } catch {
    return -1; // Path doesn't exist
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

export async function auditPermissions(env?: NodeJS.ProcessEnv): Promise<PermissionIssue[]> {
  const issues: PermissionIssue[] = [];
  const stateDir = resolveStateDir(env);
  const configPath = resolveConfigPath(env, stateDir);

  const criticalPaths = [
    { path: stateDir, isDir: true },
    { path: configPath, isDir: false },
    { path: path.join(stateDir, 'credentials'), isDir: true },
    { path: path.join(stateDir, 'agents'), isDir: true },
    { path: path.join(stateDir, 'keys'), isDir: true },
    { path: path.join(stateDir, 'logs'), isDir: true },
  ];

  for (const { path: p, isDir } of criticalPaths) {
    if (!(await pathExists(p))) {
      continue; // Skip non-existent paths
    }

    const currentMode = await getPermissionMode(p);
    if (currentMode === -1) continue;

    const expectedMode = isDir ? EXPECTED_DIR_MODE : EXPECTED_FILE_MODE;
    
    if (currentMode !== expectedMode) {
      issues.push({
        path: p,
        current: currentMode.toString(8),
        expected: expectedMode.toString(8),
        problem: `${isDir ? 'Directory' : 'File'} has insecure permissions`,
      });
    }
  }

  // Check all files in credentials directory
  const credsDir = path.join(stateDir, 'credentials');
  if (await pathExists(credsDir)) {
    try {
      const files = await fs.readdir(credsDir);
      for (const file of files) {
        const filePath = path.join(credsDir, file);
        if (await isDirectory(filePath)) continue;

        const currentMode = await getPermissionMode(filePath);
        if (currentMode !== -1 && currentMode !== EXPECTED_FILE_MODE) {
          issues.push({
            path: filePath,
            current: currentMode.toString(8),
            expected: EXPECTED_FILE_MODE.toString(8),
            problem: 'Credential file has insecure permissions',
          });
        }
      }
    } catch {
      // Directory not readable, skip
    }
  }

  return issues;
}

export async function enforceSecurePermissions(env?: NodeJS.ProcessEnv): Promise<number> {
  let fixed = 0;
  const stateDir = resolveStateDir(env);
  const configPath = resolveConfigPath(env, stateDir);

  const criticalPaths = [
    { path: stateDir, mode: EXPECTED_DIR_MODE },
    { path: configPath, mode: EXPECTED_FILE_MODE },
    { path: path.join(stateDir, 'credentials'), mode: EXPECTED_DIR_MODE },
    { path: path.join(stateDir, 'agents'), mode: EXPECTED_DIR_MODE },
    { path: path.join(stateDir, 'keys'), mode: EXPECTED_DIR_MODE },
    { path: path.join(stateDir, 'logs'), mode: EXPECTED_DIR_MODE },
  ];

  for (const { path: p, mode } of criticalPaths) {
    if (!(await pathExists(p))) {
      // Create directory if it doesn't exist
      if (mode === EXPECTED_DIR_MODE) {
        try {
          await fs.mkdir(p, { recursive: true, mode });
          fixed++;
        } catch {
          // Skip if creation fails
        }
      }
      continue;
    }

    const currentMode = await getPermissionMode(p);
    if (currentMode !== -1 && currentMode !== mode) {
      try {
        await fs.chmod(p, mode);
        fixed++;
      } catch {
        // Skip if chmod fails
      }
    }
  }

  // Fix all files in credentials directory
  const credsDir = path.join(stateDir, 'credentials');
  if (await pathExists(credsDir)) {
    try {
      const files = await fs.readdir(credsDir);
      for (const file of files) {
        const filePath = path.join(credsDir, file);
        if (await isDirectory(filePath)) continue;

        const currentMode = await getPermissionMode(filePath);
        if (currentMode !== -1 && currentMode !== EXPECTED_FILE_MODE) {
          try {
            await fs.chmod(filePath, EXPECTED_FILE_MODE);
            fixed++;
          } catch {
            // Skip if chmod fails
          }
        }
      }
    } catch {
      // Directory not readable, skip
    }
  }

  return fixed;
}

export async function ensureSecurePermissions(filePath: string, isDir: boolean): Promise<void> {
  const expectedMode = isDir ? EXPECTED_DIR_MODE : EXPECTED_FILE_MODE;
  
  if (!(await pathExists(filePath))) {
    if (isDir) {
      await fs.mkdir(filePath, { recursive: true, mode: expectedMode });
    }
    return;
  }

  const currentMode = await getPermissionMode(filePath);
  if (currentMode !== -1 && currentMode !== expectedMode) {
    await fs.chmod(filePath, expectedMode);
  }
}
