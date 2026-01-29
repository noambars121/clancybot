/**
 * Secure Setup Wizard
 * 
 * Interactive wizard for setting up Moltbot with secure defaults
 * 
 * Features:
 * - One-command secure setup
 * - Interactive security configuration
 * - Auto-generation of secure tokens
 * - Browser profile validation
 * - Security score validation
 * - Beautiful TUI interface
 * 
 * Usage: moltbot setup --secure
 * 
 * @module commands/setup-secure
 */

import { intro, outro, text, select, confirm, spinner, note } from "@clack/prompts";
import { bold, cyan, green, yellow, red, dim } from "kleur/colors";
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { MoltbotConfig } from "../config/types.js";
import { loadConfig, writeConfigFile } from "../config/config.js";
import { getChildLogger } from "../logging.js";
import {
  type SecurityProfile,
  getAllProfiles,
  applyProfile,
  getRecommendedProfile,
} from "../config/security-profiles.js";

const log = getChildLogger("setup-secure");

// ============================================================================
// Secure Defaults
// ============================================================================

function generateSecureToken(): string {
  return `sk-molt-${randomBytes(24).toString("hex")}`;
}

function getSecureDefaults(): Partial<MoltbotConfig> {
  return {
    gateway: {
      bind: "loopback",
      port: 18789,
      auth: {
        enabled: true,
        token: generateSecureToken(),
      },
      rateLimit: {
        enabled: true,
        maxAttempts: 5,
        windowMs: 300000,
      },
    },
    channels: {
      "*": {
        dmPolicy: "pairing",
        groupPolicy: "mention",
      },
    },
    agents: {
      defaults: {
        sandbox: {
          mode: "non-main",
          docker: {
            privileged: false,
            readOnlyRootFilesystem: true,
            capDrop: ["ALL"],
            seccomp: "default",
            apparmor: "default",
          },
        },
        contextTokens: 100_000,
        maxTokensPerRequest: 10_000,
        costBudget: {
          enabled: true,
          dailyLimit: 10.0,
          warningThreshold: 0.8,
        },
      },
    },
    security: {
      secrets: {
        encryption: "aes-256-gcm",
      },
      logging: {
        redactSensitive: true,
        auditEnabled: true,
      },
      browser: {
        profileValidation: true,
        blockDefaultProfile: true,
      },
      skills: {
        verification: true,
        minSecurityScore: 70,
      },
      output: {
        validation: true,
        sanitization: true,
      },
      network: {
        ssrfProtection: true,
        allowedHosts: [],
      },
      rbac: {
        adminAccountIds: [],
        adminChannels: [],
      },
    },
    logging: {
      level: "info",
      security: {
        enabled: true,
        logAuth: true,
        logToolUse: true,
        logFileAccess: true,
        logConfigChanges: true,
      },
    },
  };
}

// ============================================================================
// Wizard Steps
// ============================================================================

async function stepIntro(): Promise<void> {
  intro(bold(cyan("🔒 Moltbot Secure Setup Wizard")));
  note(
    `This wizard will configure Moltbot with Pentagon-level security.\n\n${dim("Features:")}\n• ${green("✓")} 3 Security Profiles (Maximum/Balanced/Development)\n• ${green("✓")} Auto-generated secure tokens\n• ${green("✓")} Docker sandbox isolation\n• ${green("✓")} Memory encryption\n• ${green("✓")} Network policies\n• ${green("✓")} Comprehensive monitoring`,
    "Welcome",
  );
}

async function stepSelectProfile(): Promise<SecurityProfile> {
  const profiles = getAllProfiles();

  note(
    `${bold("Choose your security profile:")}\n\n` +
      `${bold(cyan("Maximum (Pentagon++++)"))}\n` +
      `  • All protections required\n` +
      `  • Docker mandatory\n` +
      `  • Only signed skills\n` +
      `  • Score: 100/100, Layers: 14/14\n\n` +
      `${bold(green("Balanced (Pentagon+++) [RECOMMENDED]"))}\n` +
      `  • Auto-detects features\n` +
      `  • Flexible but secure\n` +
      `  • Score: 95/100, Layers: 12/14\n\n` +
      `${bold(yellow("Development (Pentagon)"))}\n` +
      `  • Minimal restrictions\n` +
      `  • For local dev only\n` +
      `  • Score: 60/100, Layers: 4/14`,
    "Security Profiles"
  );

  const profile = (await select({
    message: "Select security profile:",
    options: profiles.map((p) => ({
      value: p.id,
      label: `${p.name} (${p.badge})`,
      hint: `Score: ${p.score}/100`,
    })),
    initialValue: getRecommendedProfile().id,
  })) as SecurityProfile;

  const selectedConfig = profiles.find((p) => p.id === profile)!;

  note(
    `${selectedConfig.description}\n\n` +
      `Security Score: ${bold(String(selectedConfig.score))}/100\n` +
      `Defense Layers: ${bold(String(selectedConfig.layers))}/14`,
    selectedConfig.name
  );

  return profile;
}

async function stepAuthentication(cfg: Partial<MoltbotConfig>): Promise<void> {
  const generateToken = await confirm({
    message: "Generate secure gateway token?",
    initialValue: true,
  });

  if (generateToken) {
    const token = generateSecureToken();
    cfg.gateway = cfg.gateway || {};
    cfg.gateway.auth = { enabled: true, token };

    note(
      `${green("✓")} Generated token: ${dim(token.slice(0, 20) + "...")}\n${dim("Token saved to config. Keep it secret!")}`,
      "Authentication",
    );

    // Offer to save to .env
    const saveToEnv = await confirm({
      message: "Save token to .env file?",
      initialValue: true,
    });

    if (saveToEnv) {
      const envPath = join(homedir(), ".clancybot", ".env");
      const envContent = `CLANCYBOT_GATEWAY_TOKEN=${token}\n`;
      writeFileSync(envPath, envContent, { mode: 0o600 });
      note(`${green("✓")} Token saved to ${envPath}`, "Environment");
    }
  }
}

async function stepChannelSecurity(cfg: Partial<MoltbotConfig>): Promise<void> {
  const dmPolicy = await select({
    message: "DM Policy (who can message your bot directly)",
    options: [
      { value: "pairing", label: "Pairing (requires approval) [RECOMMENDED]", hint: "Most secure" },
      { value: "allowlist", label: "Allowlist (only approved users)", hint: "Secure" },
      { value: "open", label: "Open (anyone can message)", hint: "Not recommended" },
      { value: "disabled", label: "Disabled (no direct messages)", hint: "Very secure" },
    ],
    initialValue: "pairing",
  });

  cfg.channels = cfg.channels || {};
  cfg.channels["*"] = cfg.channels["*"] || {};
  cfg.channels["*"].dmPolicy = dmPolicy as any;

  const policyEmoji = dmPolicy === "pairing" || dmPolicy === "disabled" ? green("✓") : yellow("⚠");
  note(
    `${policyEmoji} DM Policy: ${bold(dmPolicy)}\n${dmPolicy === "pairing" ? green("✓ Requires approval for new conversations") : dmPolicy === "disabled" ? green("✓ No direct messages allowed") : yellow("⚠ Less secure than pairing")}`,
    "Channel Security",
  );
}

async function stepSandbox(cfg: Partial<MoltbotConfig>): Promise<void> {
  const enableSandbox = await confirm({
    message: "Enable Docker sandbox isolation?",
    initialValue: true,
  });

  if (enableSandbox) {
    cfg.agents = cfg.agents || {};
    cfg.agents.defaults = cfg.agents.defaults || {};
    cfg.agents.defaults.sandbox = {
      mode: "non-main",
      docker: {
        privileged: false,
        readOnlyRootFilesystem: true,
        capDrop: ["ALL"],
        seccomp: "default",
        apparmor: "default",
      },
    };

    note(
      `${green("✓")} Sandbox Mode: non-main (Docker isolation)\n${green("✓")} Read-only filesystem\n${green("✓")} No privileged mode\n${green("✓")} Capabilities dropped\n${green("✓")} Seccomp & AppArmor enabled`,
      "Sandbox Protection",
    );
  } else {
    cfg.agents = cfg.agents || {};
    cfg.agents.defaults = cfg.agents.defaults || {};
    cfg.agents.defaults.sandbox = { mode: "main" };

    note(
      `${yellow("⚠")} Sandbox disabled (mode: main)\n${yellow("⚠ Bot will run directly on host - less secure")}`,
      "Sandbox Protection",
    );
  }
}

async function stepBrowser(cfg: Partial<MoltbotConfig>): Promise<void> {
  const browserProfile = await text({
    message: "Browser profile for bot (leave empty to skip)",
    placeholder: "clancybot",
    validate: (value) => {
      if (!value) return undefined;  // OK to skip
      
      // Check for default profile names
      const defaultNames = ["default", "profile 1", "profile 2"];
      if (defaultNames.includes(value.toLowerCase())) {
        return "Cannot use default browser profile (security risk)";
      }
      
      return undefined;
    },
  });

  if (browserProfile) {
    cfg.browser = cfg.browser || {};
    cfg.browser.profile = browserProfile as string;
    
    cfg.security = cfg.security || {};
    cfg.security.browser = {
      profileValidation: true,
      blockDefaultProfile: true,
    };

    note(
      `${green("✓")} Browser Profile: ${bold(browserProfile)}\n${green("✓")} Profile validation enabled\n${green("✓")} Default profile blocked`,
      "Browser Safety",
    );
  } else {
    note(
      `${dim("Skipped browser configuration")}\n${yellow("⚠ Remember to configure browser profile later")}`,
      "Browser Safety",
    );
  }
}

async function stepFinalChecks(cfg: Partial<MoltbotConfig>): Promise<number> {
  const s = spinner();
  s.start("Running security checks...");

  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Calculate security score
  let score = 100;
  const checks: Array<{ label: string; passed: boolean }> = [];

  // Authentication
  const authEnabled = cfg.gateway?.auth?.enabled === true;
  checks.push({ label: "Authentication", passed: authEnabled });
  if (!authEnabled) score -= 20;

  // DM Policy
  const dmPolicy = cfg.channels?.["*"]?.dmPolicy;
  const secureDmPolicy = dmPolicy === "pairing" || dmPolicy === "disabled" || dmPolicy === "allowlist";
  checks.push({ label: "DM Policy", passed: secureDmPolicy });
  if (!secureDmPolicy) score -= 15;

  // Sandbox
  const sandboxEnabled = cfg.agents?.defaults?.sandbox?.mode === "non-main";
  checks.push({ label: "Sandbox", passed: sandboxEnabled });
  if (!sandboxEnabled) score -= 20;

  // Secrets encryption
  const secretsEncrypted = cfg.security?.secrets?.encryption === "aes-256-gcm";
  checks.push({ label: "Secrets Encryption", passed: secretsEncrypted });
  if (!secretsEncrypted) score -= 10;

  // Skills verification
  const skillsVerified = cfg.security?.skills?.verification === true;
  checks.push({ label: "Skills Verification", passed: skillsVerified });
  if (!skillsVerified) score -= 5;

  // Rate limiting
  const rateLimited = cfg.gateway?.rateLimit?.enabled === true;
  checks.push({ label: "Rate Limiting", passed: rateLimited });
  if (!rateLimited) score -= 5;

  // Logging
  const loggingEnabled = cfg.logging?.security?.enabled === true;
  checks.push({ label: "Security Logging", passed: loggingEnabled });
  if (!loggingEnabled) score -= 5;

  s.stop("Security checks complete");

  const checkList = checks
    .map((c) => `${c.passed ? green("✓") : red("✗")} ${c.label}`)
    .join("\n");

  const scoreColor = score >= 90 ? green : score >= 70 ? yellow : red;
  const badge = score === 100 ? "🏆 Pentagon++" : score >= 90 ? "🛡️ Pentagon" : score >= 70 ? "⚠️ Good" : "❌ Needs Work";

  note(
    `${checkList}\n\n${bold(scoreColor(`Security Score: ${score}/100`))} ${badge}`,
    "Final Checks",
  );

  return score;
}

// ============================================================================
// Main Wizard
// ============================================================================

export async function runSecureSetup(): Promise<void> {
  try {
    await stepIntro();

    // Step 1: Select security profile
    const profile = await stepSelectProfile();

    // Load existing config or start fresh
    const existingConfig = existsSync(join(homedir(), ".moltbot", "moltbot.json"))
      ? loadConfig()
      : {};

    // Apply profile
    const cfg: Partial<MoltbotConfig> = applyProfile(profile, existingConfig);

    // Step 2: Customize profile (optional)
    const customize = await confirm({
      message: "Customize profile settings?",
      initialValue: false,
    });

    if (customize) {
      // Run wizard steps for customization
      await stepAuthentication(cfg);
      await stepChannelSecurity(cfg);
      await stepSandbox(cfg);
      await stepBrowser(cfg);
    }

    // Final checks
    const score = await stepFinalChecks(cfg);

    // Save config
    const s = spinner();
    s.start("Saving configuration...");
    await new Promise((resolve) => setTimeout(resolve, 500));
    await writeConfigFile(cfg as MoltbotConfig);
    s.stop("Configuration saved");

    // Get profile name
    const profileConfig = getAllProfiles().find((p) => p.id === profile)!;

    // Final message
    outro(
      bold(
        green(
          `🎉 Setup Complete!\n\n` +
            `Profile: ${profileConfig.name} (${profileConfig.badge})\n` +
            `Security Score: ${score}/100\n` +
            `Defense Layers: ${profileConfig.layers}/14\n\n` +
            `Next steps:\n` +
            `  1. Start gateway: ${cyan("moltbot gateway run")}\n` +
            `  2. View security: ${cyan("moltbot profile show")}\n` +
            `  3. Dashboard: ${cyan("http://localhost:18789/security")}\n\n` +
            `${dim("Change profile anytime: ")}${cyan("moltbot profile select")}`,
        ),
      ),
    );

    log.info("Secure setup completed", { profile: profileConfig.name, score });
  } catch (err) {
    log.error("Setup failed", err);
    outro(red("Setup cancelled or failed"));
    process.exit(1);
  }
}

// ============================================================================
// CLI Integration
// ============================================================================

export const setupSecureCommand = {
  command: "setup --secure",
  description: "Interactive secure setup wizard",
  handler: runSecureSetup,
};
