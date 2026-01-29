/**
 * Physical Security Checks for moltbot doctor
 * 
 * Checks physical/on-premise security:
 * - Disk encryption (FileVault/LUKS)
 * - Screen auto-lock
 * - Firewall status
 * - Config directory permissions
 * - Physical access controls
 * 
 * Addresses: Physical device theft threat
 * 
 * @module commands/doctor-physical
 */

import { exec as execCallback } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { promisify } from "node:util";
import { getChildLogger } from "../logging.js";

const log = getChildLogger({ module: "doctor-physical" });

const exec = promisify(execCallback);

// ============================================================================
// Types
// ============================================================================

export type PhysicalCheck = {
  name: string;
  passed: boolean;
  severity: "critical" | "high" | "medium" | "low";
  status: string;
  recommendation?: string;
  error?: string;
};

export type PhysicalSecurityReport = {
  checks: PhysicalCheck[];
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  summary: string;
};

// ============================================================================
// Platform Detection
// ============================================================================

const isMac = process.platform === "darwin";
const isLinux = process.platform === "linux";
const isWindows = process.platform === "win32";

// ============================================================================
// Disk Encryption Checks
// ============================================================================

/**
 * Check macOS FileVault status
 */
async function checkFileVault(): Promise<PhysicalCheck> {
  if (!isMac) {
    return {
      name: "Disk Encryption (FileVault)",
      passed: true,
      severity: "critical",
      status: "N/A (not macOS)",
    };
  }

  try {
    const { stdout } = await exec("fdesetup status");
    const enabled = stdout.includes("FileVault is On");

    if (enabled) {
      return {
        name: "Disk Encryption (FileVault)",
        passed: true,
        severity: "critical",
        status: "Enabled ✅",
        recommendation: "FileVault is protecting your disk",
      };
    }

    return {
      name: "Disk Encryption (FileVault)",
      passed: false,
      severity: "critical",
      status: "Disabled ❌",
      recommendation:
        "Enable FileVault to encrypt your disk:\n" +
        "  System Settings > Privacy & Security > FileVault > Turn On\n" +
        "  This protects data if Mac Mini is stolen or accessed physically.",
    };
  } catch (err) {
    return {
      name: "Disk Encryption (FileVault)",
      passed: false,
      severity: "critical",
      status: "Unknown",
      error: err instanceof Error ? err.message : String(err),
      recommendation: "Could not check FileVault status. Run: fdesetup status",
    };
  }
}

/**
 * Check Linux LUKS encryption
 */
async function checkLUKS(): Promise<PhysicalCheck> {
  if (!isLinux) {
    return {
      name: "Disk Encryption (LUKS)",
      passed: true,
      severity: "critical",
      status: "N/A (not Linux)",
    };
  }

  try {
    const { stdout } = await exec("lsblk -o NAME,FSTYPE 2>/dev/null || true");
    const hasLUKS = stdout.includes("crypto_LUKS");

    if (hasLUKS) {
      return {
        name: "Disk Encryption (LUKS)",
        passed: true,
        severity: "critical",
        status: "Detected ✅",
        recommendation: "LUKS encryption is protecting your disk",
      };
    }

    return {
      name: "Disk Encryption (LUKS)",
      passed: false,
      severity: "critical",
      status: "Not detected ❌",
      recommendation:
        "Consider enabling full disk encryption with LUKS:\n" +
        "  https://wiki.archlinux.org/title/Dm-crypt/Encrypting_an_entire_system\n" +
        "  This protects data if device is stolen or accessed physically.",
    };
  } catch (err) {
    return {
      name: "Disk Encryption (LUKS)",
      passed: false,
      severity: "critical",
      status: "Unknown",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Check Windows BitLocker
 */
async function checkBitLocker(): Promise<PhysicalCheck> {
  if (!isWindows) {
    return {
      name: "Disk Encryption (BitLocker)",
      passed: true,
      severity: "critical",
      status: "N/A (not Windows)",
    };
  }

  try {
    const { stdout } = await exec("manage-bde -status C:");
    const enabled = stdout.includes("Protection On");

    if (enabled) {
      return {
        name: "Disk Encryption (BitLocker)",
        passed: true,
        severity: "critical",
        status: "Enabled ✅",
        recommendation: "BitLocker is protecting your disk",
      };
    }

    return {
      name: "Disk Encryption (BitLocker)",
      passed: false,
      severity: "critical",
      status: "Disabled ❌",
      recommendation:
        "Enable BitLocker to encrypt your disk:\n" +
        "  Settings > System > Storage > Advanced storage settings > BitLocker",
    };
  } catch (err) {
    return {
      name: "Disk Encryption (BitLocker)",
      passed: false,
      severity: "critical",
      status: "Unknown",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================================================
// Screen Lock Checks
// ============================================================================

/**
 * Check macOS screen lock settings
 */
async function checkMacScreenLock(): Promise<PhysicalCheck> {
  if (!isMac) {
    return {
      name: "Auto-lock Screen",
      passed: true,
      severity: "high",
      status: "N/A (not macOS)",
    };
  }

  try {
    // Check if screen saver password is required
    const { stdout: askPass } = await exec(
      "defaults read com.apple.screensaver askForPassword 2>/dev/null || echo 0",
    );
    const askPasswordEnabled = askPass.trim() === "1";

    // Check screen saver timeout
    const { stdout: idleTime } = await exec(
      "defaults -currentHost read com.apple.screensaver idleTime 2>/dev/null || echo 0",
    );
    const timeout = parseInt(idleTime.trim(), 10);

    if (askPasswordEnabled && timeout > 0 && timeout <= 600) {
      return {
        name: "Auto-lock Screen",
        passed: true,
        severity: "high",
        status: `Enabled (${Math.floor(timeout / 60)}min) ✅`,
        recommendation: "Screen locks automatically after inactivity",
      };
    }

    if (!askPasswordEnabled) {
      return {
        name: "Auto-lock Screen",
        passed: false,
        severity: "high",
        status: "Password not required ❌",
        recommendation:
          "Require password after screen saver:\n" +
          "  System Settings > Lock Screen > Require password immediately",
      };
    }

    if (timeout === 0 || timeout > 600) {
      return {
        name: "Auto-lock Screen",
        passed: false,
        severity: "high",
        status: timeout === 0 ? "Never locks ❌" : "Timeout too long ⚠️",
        recommendation:
          "Set screen to lock after 5-10 minutes:\n" +
          "  System Settings > Lock Screen > Start Screen Saver when inactive",
      };
    }

    return {
      name: "Auto-lock Screen",
      passed: true,
      severity: "high",
      status: "Configured",
    };
  } catch (err) {
    return {
      name: "Auto-lock Screen",
      passed: false,
      severity: "high",
      status: "Unknown",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================================================
// Firewall Checks
// ============================================================================

/**
 * Check macOS firewall
 */
async function checkMacFirewall(): Promise<PhysicalCheck> {
  if (!isMac) {
    return {
      name: "Firewall",
      passed: true,
      severity: "medium",
      status: "N/A (not macOS)",
    };
  }

  try {
    const { stdout } = await exec(
      "defaults read /Library/Preferences/com.apple.alf globalstate 2>/dev/null || echo 0",
    );
    const state = parseInt(stdout.trim(), 10);
    const enabled = state > 0;

    if (enabled) {
      return {
        name: "Firewall",
        passed: true,
        severity: "medium",
        status: "Active ✅",
        recommendation: "macOS firewall is protecting your network",
      };
    }

    return {
      name: "Firewall",
      passed: false,
      severity: "medium",
      status: "Inactive ❌",
      recommendation:
        "Enable firewall for network protection:\n" +
        "  System Settings > Network > Firewall > Turn On",
    };
  } catch (err) {
    return {
      name: "Firewall",
      passed: false,
      severity: "medium",
      status: "Unknown",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Check Linux firewall (ufw/iptables)
 */
async function checkLinuxFirewall(): Promise<PhysicalCheck> {
  if (!isLinux) {
    return {
      name: "Firewall",
      passed: true,
      severity: "medium",
      status: "N/A (not Linux)",
    };
  }

  try {
    // Try ufw first
    try {
      const { stdout } = await exec("ufw status 2>/dev/null || true");
      if (stdout.includes("Status: active")) {
        return {
          name: "Firewall",
          passed: true,
          severity: "medium",
          status: "Active (ufw) ✅",
        };
      }
    } catch {
      // ufw not available
    }

    // Try iptables
    const { stdout: iptables } = await exec(
      "iptables -L -n 2>/dev/null | wc -l || echo 0",
    );
    const ruleCount = parseInt(iptables.trim(), 10);

    if (ruleCount > 10) {
      return {
        name: "Firewall",
        passed: true,
        severity: "medium",
        status: "Active (iptables) ✅",
      };
    }

    return {
      name: "Firewall",
      passed: false,
      severity: "medium",
      status: "Not detected ❌",
      recommendation:
        "Enable firewall for network protection:\n" +
        "  sudo ufw enable (Ubuntu/Debian)\n" +
        "  Or configure iptables rules",
    };
  } catch (err) {
    return {
      name: "Firewall",
      passed: false,
      severity: "medium",
      status: "Unknown",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================================================
// Permissions Checks
// ============================================================================

/**
 * Check ~/.moltbot permissions
 */
async function checkConfigPermissions(): Promise<PhysicalCheck> {
  const configDir = join(homedir(), ".moltbot");

  try {
    const stats = await stat(configDir);
    const mode = (stats.mode & 0o777).toString(8);

    if (mode === "700") {
      return {
        name: "Config Directory Permissions",
        passed: true,
        severity: "high",
        status: "Secure (700) ✅",
        recommendation: "Only owner can access config directory",
      };
    }

    if (mode === "755" || mode === "775" || mode === "777") {
      return {
        name: "Config Directory Permissions",
        passed: false,
        severity: "high",
        status: `Too permissive (${mode}) ❌`,
        recommendation:
          "Restrict config directory permissions:\n" +
          `  chmod 700 ${configDir}\n` +
          "  This prevents other users from accessing your bot config.",
      };
    }

    return {
      name: "Config Directory Permissions",
      passed: false,
      severity: "high",
      status: `Unusual (${mode}) ⚠️`,
      recommendation: `Set secure permissions: chmod 700 ${configDir}`,
    };
  } catch (err) {
    return {
      name: "Config Directory Permissions",
      passed: false,
      severity: "high",
      status: "Unknown",
      error: err instanceof Error ? err.message : String(err),
      recommendation: `Config directory not found: ${configDir}`,
    };
  }
}

// ============================================================================
// Main Check Function
// ============================================================================

/**
 * Run all physical security checks
 */
export async function runPhysicalSecurityChecks(): Promise<PhysicalSecurityReport> {
  log.info("Running physical security checks...");

  const checks: PhysicalCheck[] = [];

  // Disk encryption (platform-specific)
  if (isMac) {
    checks.push(await checkFileVault());
  } else if (isLinux) {
    checks.push(await checkLUKS());
  } else if (isWindows) {
    checks.push(await checkBitLocker());
  }

  // Screen lock
  if (isMac) {
    checks.push(await checkMacScreenLock());
  }

  // Firewall
  if (isMac) {
    checks.push(await checkMacFirewall());
  } else if (isLinux) {
    checks.push(await checkLinuxFirewall());
  }

  // Permissions (all platforms)
  checks.push(await checkConfigPermissions());

  // Calculate score
  const totalWeight = checks.reduce((sum, check) => {
    return sum + (check.severity === "critical" ? 40 : check.severity === "high" ? 20 : 10);
  }, 0);

  const earnedWeight = checks
    .filter((c) => c.passed)
    .reduce((sum, check) => {
      return sum + (check.severity === "critical" ? 40 : check.severity === "high" ? 20 : 10);
    }, 0);

  const score = Math.round((earnedWeight / totalWeight) * 100);

  // Grade
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";

  // Summary
  const passedCount = checks.filter((c) => c.passed).length;
  const failedCount = checks.length - passedCount;
  const criticalFailed = checks.filter((c) => !c.passed && c.severity === "critical").length;

  let summary = `Physical Security: ${score}/100 (Grade ${grade})`;
  if (failedCount === 0) {
    summary += "\n✅ All physical security checks passed!";
  } else {
    summary += `\n⚠️  ${failedCount} check(s) failed`;
    if (criticalFailed > 0) {
      summary += ` (${criticalFailed} critical)`;
    }
  }

  return { checks, score, grade, summary };
}

// ============================================================================
// Export
// ============================================================================

export const PhysicalSecurity = {
  runChecks: runPhysicalSecurityChecks,
  checks: {
    fileVault: checkFileVault,
    luks: checkLUKS,
    bitLocker: checkBitLocker,
    macScreenLock: checkMacScreenLock,
    macFirewall: checkMacFirewall,
    linuxFirewall: checkLinuxFirewall,
    configPermissions: checkConfigPermissions,
  },
};
