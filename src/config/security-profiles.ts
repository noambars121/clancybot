/**
 * Security Profiles - Predefined security configurations
 *
 * Provides 3 security profiles for different use cases:
 * - Maximum (Pentagon++++) - All protections required
 * - Balanced (Pentagon+++) - Recommended for most users
 * - Development (Pentagon) - For local development only
 *
 * NOTE: This is a simplified version. Full config options for security
 * features (memory encryption, canary tokens, network policies, etc.)
 * are managed through separate config sections and CLI commands.
 *
 * @see Phase 10 - Pentagon++++ Security (Secure by Default)
 */

import type { MoltbotConfig } from "./types.js";
import { getChildLogger } from "../logging.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const log = getChildLogger({ module: "security-profiles" });
const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

export type SecurityProfile = "maximum" | "balanced" | "development";

export type ProfileConfig = {
  id: SecurityProfile;
  name: string;
  badge: string;
  description: string;
  score: number;
  layers: number;
  settings: Partial<MoltbotConfig>;
  warnings?: string[];
  recommended?: boolean;
};

// ============================================================================
// Profile Definitions
// ============================================================================

/**
 * Maximum Security Profile (Pentagon++++)
 *
 * All security features enabled with no exceptions.
 * Suitable for production, enterprise, or sensitive data.
 *
 * Features (enabled via CLI/setup):
 * - Docker sandbox (required)
 * - Memory encryption
 * - Signed skills only
 * - Network policies per skill
 * - Full monitoring (canaries + red team)
 *
 * Score: 100/100
 * Layers: 14/14
 */
export const MAXIMUM_PROFILE: ProfileConfig = {
  id: "maximum",
  name: "Maximum Security",
  badge: "Pentagon++++",
  description: "אבטחה מקסימלית - אין פשרות. מתאים לייצור ומידע רגיש.",
  score: 100,
  layers: 14,
  settings: {
    // Sandbox - all agents in Docker
    agents: {
      defaults: {
        sandbox: {
          mode: "all",
          workspaceAccess: "ro",
        },
      },
    },

    // Gateway - loopback only + token auth
    gateway: {
      bind: "loopback",
      auth: {
        mode: "token",
      },
    },

    // Diagnostics - use defaults
  },
  warnings: [
    "⚠️ Docker is required (sandbox mode: all)",
    "⚠️ Setup required: `moltbot setup --secure` to configure all protections",
    "⚠️ Memory encryption, skill signing, and network policies must be configured separately",
  ],
};

/**
 * Balanced Security Profile (Pentagon+++) [RECOMMENDED]
 *
 * Optimal balance between security and usability.
 * Suitable for most personal and professional use.
 *
 * Features:
 * - Auto-detects Docker (uses if available)
 * - Prompts for encryption on first run
 * - Warns about unsigned skills (allows with approval)
 * - Auto-applies network policies by category
 * - Standard monitoring (canaries + audit)
 *
 * Score: 95/100
 * Layers: 12/14
 */
export const BALANCED_PROFILE: ProfileConfig = {
  id: "balanced",
  name: "Balanced",
  badge: "Pentagon+++",
  description: "האיזון המושלם - אבטחה חזקה עם נוחות. מומלץ לרוב המשתמשים.",
  score: 95,
  layers: 12,
  recommended: true,
  settings: {
    // Sandbox - non-main agents only (auto-detect Docker)
    agents: {
      defaults: {
        sandbox: {
          mode: "non-main",
          workspaceAccess: "rw",
        },
      },
    },

    // Gateway - loopback by default
    gateway: {
      bind: "loopback",
      auth: {
        mode: "token",
      },
    },

    // Diagnostics - use defaults
  },
  warnings: [
    "💡 Docker recommended but optional",
    "💡 Run `moltbot setup --secure` to configure full protection",
  ],
};

/**
 * Development Security Profile (Pentagon)
 *
 * Minimal restrictions for local development and testing.
 * NOT suitable for production use.
 *
 * Features:
 * - No sandboxing (native runtime)
 * - No encryption
 * - Permissive skill loading
 * - Network warnings only
 * - Minimal monitoring
 *
 * Score: 60/100
 * Layers: 4/14
 */
export const DEVELOPMENT_PROFILE: ProfileConfig = {
  id: "development",
  name: "Development",
  badge: "Pentagon",
  description: "פיתוח מקומי - מינימום מגבלות. אסור לשימוש בייצור!",
  score: 60,
  layers: 4,
  settings: {
    // Sandbox - off
    agents: {
      defaults: {
        sandbox: {
          mode: "off",
        },
      },
    },

    // Gateway - localhost
    gateway: {
      bind: "loopback",
    },

    // Diagnostics - use defaults
  },
  warnings: [
    "⚠️ NOT FOR PRODUCTION USE",
    "⚠️ No sandboxing - skills run with full system access",
    "⚠️ No encryption - memory files stored in plaintext",
    "⚠️ No network policies - unrestricted internet access",
  ],
};

// ============================================================================
// Profile Registry
// ============================================================================

export const SECURITY_PROFILES: Record<SecurityProfile, ProfileConfig> = {
  maximum: MAXIMUM_PROFILE,
  balanced: BALANCED_PROFILE,
  development: DEVELOPMENT_PROFILE,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Apply a security profile to config
 */
export function applyProfile(
  profile: SecurityProfile,
  existingConfig: Partial<MoltbotConfig> = {}
): MoltbotConfig {
  const profileConfig = SECURITY_PROFILES[profile];

  return {
    ...existingConfig,
    ...profileConfig.settings,
    // Store profile metadata for reference
    meta: {
      ...existingConfig.meta,
      securityProfile: profile,
      lastTouchedVersion: existingConfig.meta?.lastTouchedVersion,
      lastTouchedAt: new Date().toISOString(),
    },
  } as MoltbotConfig;
}

/**
 * Get current profile from config
 */
export function getCurrentProfile(config: MoltbotConfig): SecurityProfile | null {
  return ((config as any).meta?.securityProfile as SecurityProfile) || null;
}

/**
 * Get recommended profile based on environment
 */
export function getRecommendedProfile(): SecurityProfile {
  // Always recommend balanced for new users
  return "balanced";
}

/**
 * Get all profiles
 */
export function getAllProfiles(): ProfileConfig[] {
  return Object.values(SECURITY_PROFILES);
}

/**
 * Get profile by ID
 */
export function getProfile(id: SecurityProfile): ProfileConfig {
  return SECURITY_PROFILES[id];
}

/**
 * Validate profile requirements
 */
export async function validateProfile(
  profile: SecurityProfile
): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const profileConfig = SECURITY_PROFILES[profile];

  // Check Docker for maximum profile
  if (profile === "maximum") {
    const hasDocker = await checkDockerAvailable();
    if (!hasDocker) {
      errors.push("Docker is required for maximum security profile but not found");
    }
  }

  // Add profile warnings
  if (profileConfig.warnings) {
    warnings.push(...profileConfig.warnings);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if Docker is available
 */
async function checkDockerAvailable(): Promise<boolean> {
  try {
    await execAsync("docker --version");
    return true;
  } catch {
    return false;
  }
}
