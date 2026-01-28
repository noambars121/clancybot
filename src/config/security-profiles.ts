/**
 * Security Profiles - Predefined security configurations
 *
 * Provides 3 security profiles for different use cases:
 * - Maximum (Pentagon++++) - All protections required
 * - Balanced (Pentagon+++) - Recommended for most users
 * - Development (Pentagon) - For local development only
 *
 * @see Phase 10 - Pentagon++++ Security (Secure by Default)
 */

import type { MoltbotConfig } from "./types.js";
import { log } from "../common/log.js";

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
 * Requirements:
 * - Docker must be installed (sandbox required)
 * - Memory encryption required
 * - Only signed skills allowed
 * - Network policies required per skill
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
    // Sandbox - REQUIRED
    agents: {
      defaults: {
        sandbox: {
          mode: "required", // Must have Docker
          docker: {
            privileged: false,
            readOnlyRootFilesystem: true,
            capDrop: ["ALL"],
            seccomp: "default",
            apparmor: "default",
            network: "none",
            tmpfs: ["/tmp", "/var/tmp", "/run"],
          },
        },
      },
    },

    // Skills - STRICT
    skills: {
      loadMode: "strict", // Only signed skills
      autoNetworkPolicy: true,
      runtime: "docker", // Force Docker
    },

    // Memory - REQUIRED
    memory: {
      autoEncrypt: true,
      encryption: "aes-256-gcm",
      storeInKeychain: true,
    },

    // Network - STRICT
    network: {
      defaultPolicy: "public-api",
      blockPrivateIPs: true,
      blockMetadata: true,
      requirePolicyPerSkill: true,
    },

    // Security - FULL
    security: {
      monitoring: {
        enabled: true,
        canaryTokens: true,
        redTeam: true,
        redTeamInterval: 3600, // hourly
      },
      rbac: {
        enabled: true,
        defaultRole: "user",
        requireApproval: true,
      },
      toxicFlows: {
        enabled: true,
        blockDangerous: true,
      },
      physicalSecurity: {
        checkOnStartup: true,
        requireDiskEncryption: true,
      },
    },

    // Gateway
    gateway: {
      bind: "loopback",
      auth: {
        enabled: true,
        requireToken: true,
      },
      rateLimit: {
        enabled: true,
        maxAttempts: 5,
        windowMs: 300000,
      },
      csrf: {
        enabled: true,
      },
    },

    // Logging
    logging: {
      security: {
        enabled: true,
        logAuth: true,
        logToolUse: true,
        logFileAccess: true,
        logNetworkRequests: true,
      },
      redactSensitive: "all",
    },
  },
  warnings: [
    "⚠️ Docker is required (sandbox mode: required)",
    "⚠️ Cannot run unsigned skills",
    "⚠️ Network policies must be configured per skill",
    "⚠️ Memory encryption required (passphrase needed)",
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
    // Sandbox - AUTO
    agents: {
      defaults: {
        sandbox: {
          mode: "auto", // Use Docker if available
          docker: {
            privileged: false,
            readOnlyRootFilesystem: true,
            capDrop: ["ALL"],
            seccomp: "default",
            apparmor: "default",
          },
        },
      },
    },

    // Skills - WARN
    skills: {
      loadMode: "warn", // Warn about unsigned, allow with approval
      autoNetworkPolicy: true,
      runtime: "auto",
    },

    // Memory - AUTO
    memory: {
      autoEncrypt: "prompt", // Ask on first run
      encryption: "aes-256-gcm",
      storeInKeychain: true,
    },

    // Network - AUTO
    network: {
      defaultPolicy: "public-api",
      blockPrivateIPs: true,
      blockMetadata: true,
      autoApplyPresets: true,
    },

    // Security - STANDARD
    security: {
      monitoring: {
        enabled: true,
        canaryTokens: true,
        redTeam: false, // Not automatic (can enable manually)
      },
      rbac: {
        enabled: true,
        defaultRole: "user",
        requireApproval: true,
      },
      toxicFlows: {
        enabled: true,
        blockDangerous: false, // Warn instead
      },
      physicalSecurity: {
        checkOnStartup: true,
        requireDiskEncryption: false, // Warn only
      },
    },

    // Gateway
    gateway: {
      bind: "loopback",
      auth: {
        enabled: true,
        requireToken: true,
      },
      rateLimit: {
        enabled: true,
        maxAttempts: 10,
        windowMs: 300000,
      },
      csrf: {
        enabled: true,
      },
    },

    // Logging
    logging: {
      security: {
        enabled: true,
        logAuth: true,
        logToolUse: true,
        logFileAccess: true,
        logNetworkRequests: true,
      },
      redactSensitive: "tools",
    },
  },
  warnings: [
    "⚠️ Unsigned skills allowed with manual approval",
    "⚠️ Red team not automatic (enable with: moltbot security redteam start)",
  ],
};

/**
 * Development Profile (Pentagon)
 *
 * Minimal restrictions for local development.
 * NOT RECOMMENDED for production or sensitive data.
 *
 * Features:
 * - Native runtime (no Docker)
 * - No encryption (plaintext)
 * - All skills allowed (including unsigned)
 * - Network warnings only (not enforced)
 * - Minimal monitoring (audit log only)
 *
 * Score: 60/100
 * Layers: 4/14
 */
export const DEVELOPMENT_PROFILE: ProfileConfig = {
  id: "development",
  name: "Development",
  badge: "Pentagon",
  description: "חופש מקסימלי - למפתחים בלבד. אל תשתמש בייצור!",
  score: 60,
  layers: 4,
  settings: {
    // Sandbox - OFF
    agents: {
      defaults: {
        sandbox: {
          mode: "main", // Native runtime
        },
      },
    },

    // Skills - PERMISSIVE
    skills: {
      loadMode: "permissive", // Allow all
      autoNetworkPolicy: false,
      runtime: "native",
    },

    // Memory - OFF
    memory: {
      autoEncrypt: false,
      encryption: "none",
    },

    // Network - WARN ONLY
    network: {
      defaultPolicy: "unrestricted",
      blockPrivateIPs: false,
      blockMetadata: false,
      enforcement: "warn", // Warn only, don't block
    },

    // Security - MINIMAL
    security: {
      monitoring: {
        enabled: false,
        canaryTokens: false,
        redTeam: false,
      },
      rbac: {
        enabled: false,
      },
      toxicFlows: {
        enabled: false,
      },
      physicalSecurity: {
        checkOnStartup: false,
      },
    },

    // Gateway
    gateway: {
      bind: "localhost",
      auth: {
        enabled: false, // No auth in dev
      },
      rateLimit: {
        enabled: false,
      },
      csrf: {
        enabled: false,
      },
    },

    // Logging
    logging: {
      security: {
        enabled: true,
        logAuth: false,
        logToolUse: false,
        logFileAccess: false,
        logNetworkRequests: false,
      },
      redactSensitive: "none",
    },
  },
  warnings: [
    "🚨 NO SANDBOXING - Skills run directly on your machine!",
    "🚨 NO ENCRYPTION - All data stored in plaintext!",
    "🚨 NO VERIFICATION - Any skill can run, including malicious ones!",
    "🚨 NO NETWORK POLICIES - Skills can access any URL!",
    "🚨 USE ONLY on isolated development machines!",
    "🚨 DO NOT use with sensitive data!",
    "🚨 DO NOT use in production!",
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
// Profile Selection
// ============================================================================

/**
 * Get profile by ID
 */
export function getProfile(id: SecurityProfile): ProfileConfig {
  return SECURITY_PROFILES[id];
}

/**
 * Get recommended profile
 */
export function getRecommendedProfile(): ProfileConfig {
  return BALANCED_PROFILE;
}

/**
 * Get all profiles
 */
export function getAllProfiles(): ProfileConfig[] {
  return Object.values(SECURITY_PROFILES);
}

/**
 * Apply profile to config
 */
export function applyProfile(
  profile: SecurityProfile,
  existingConfig: Partial<MoltbotConfig> = {}
): MoltbotConfig {
  const profileConfig = getProfile(profile);

  log.info("Applying security profile", {
    profile: profileConfig.name,
    badge: profileConfig.badge,
    score: profileConfig.score,
  });

  // Deep merge settings
  const merged = {
    ...existingConfig,
    ...profileConfig.settings,
    // Store profile metadata
    security: {
      ...existingConfig.security,
      ...profileConfig.settings.security,
      profile: {
        id: profile,
        name: profileConfig.name,
        badge: profileConfig.badge,
        appliedAt: new Date().toISOString(),
      },
    },
  };

  return merged as MoltbotConfig;
}

/**
 * Get current profile from config
 */
export function getCurrentProfile(config: MoltbotConfig): SecurityProfile | null {
  return (config.security as any)?.profile?.id || null;
}

/**
 * Validate profile requirements
 */
export async function validateProfile(profile: SecurityProfile): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
}> {
  const profileConfig = getProfile(profile);
  const errors: string[] = [];
  const warnings: string[] = profileConfig.warnings || [];

  // Check Docker for Maximum profile
  if (profile === "maximum") {
    const hasDocker = await checkDockerAvailable();
    if (!hasDocker) {
      errors.push("Docker is required for Maximum profile");
    }
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
    const { execSync } = await import("node:child_process");
    execSync("docker --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Compare two profiles
 */
export function compareProfiles(a: SecurityProfile, b: SecurityProfile): {
  scoreDiff: number;
  layersDiff: number;
  moreSecure: SecurityProfile;
} {
  const profileA = getProfile(a);
  const profileB = getProfile(b);

  return {
    scoreDiff: profileA.score - profileB.score,
    layersDiff: profileA.layers - profileB.layers,
    moreSecure: profileA.score >= profileB.score ? a : b,
  };
}

// ============================================================================
// Profile Info Display
// ============================================================================

export function getProfileSummary(profile: SecurityProfile): string {
  const config = getProfile(profile);

  return `
${config.badge} - ${config.name}
${config.description}

Security Score: ${config.score}/100
Defense Layers: ${config.layers}/14

${config.warnings && config.warnings.length > 0 ? `\nWarnings:\n${config.warnings.join("\n")}` : ""}
  `.trim();
}
