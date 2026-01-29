/**
 * Secure Setup Wizard
 * 
 * Interactive wizard for setting up Moltbot with secure defaults
 * 
 * Features:
 * - Security profile selection (Maximum/Balanced/Development)
 * - Gateway authentication token generation
 * - Docker sandbox configuration
 * - Browser profile validation
 * - Security score validation
 * 
 * Usage: moltbot setup --secure
 * 
 * @module commands/setup-secure
 */

import { intro, outro, select, confirm, spinner, note } from "@clack/prompts";
import { bold, cyan, green, yellow, red, dim } from "kleur/colors";
import { randomBytes } from "node:crypto";
import type { MoltbotConfig } from "../config/types.js";
import { loadConfig, writeConfigFile } from "../config/config.js";
import { getChildLogger } from "../logging.js";
import {
  type SecurityProfile,
  getAllProfiles,
  applyProfile,
  getRecommendedProfile,
  validateProfile,
} from "../config/security-profiles.js";

const log = getChildLogger({ module: "setup-secure" });

// ============================================================================
// Helpers
// ============================================================================

function generateSecureToken(): string {
  return randomBytes(32).toString("base64url");
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
    initialValue: getRecommendedProfile(),
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

async function stepValidateProfile(profile: SecurityProfile): Promise<boolean> {
  const s = spinner();
  s.start("Validating profile requirements...");

  const validation = await validateProfile(profile);

  s.stop("Validation complete");

  if (validation.errors.length > 0) {
    note(red(validation.errors.join("\n")), "Errors");
    return false;
  }

  if (validation.warnings.length > 0) {
    note(yellow(validation.warnings.join("\n")), "Warnings");
  }

  return true;
}

async function stepCustomizeSettings(cfg: MoltbotConfig): Promise<void> {
  const customize = await confirm({
    message: "Do you want to customize profile settings?",
    initialValue: false,
  });

  if (!customize) {
    return;
  }

  // Gateway token
  const generateToken = await confirm({
    message: "Generate secure gateway token?",
    initialValue: true,
  });

  if (generateToken) {
    const token = generateSecureToken();
    cfg.gateway = cfg.gateway || {};
    cfg.gateway.auth = { mode: "token", token };

    note(
      `${green("✓")} Token: ${bold(token)}\n${dim("Save this token - you'll need it to connect!")}`,
      "Authentication",
    );
  }
}

// ============================================================================
// Main Wizard
// ============================================================================

export async function runSecureSetup(): Promise<void> {
  await stepIntro();

  // Step 1: Select profile
  const profile = await stepSelectProfile();

  // Step 2: Validate profile
  const valid = await stepValidateProfile(profile);
  if (!valid) {
    outro(red("Setup cancelled - profile requirements not met"));
    return;
  }

  // Step 3: Apply profile
  const s = spinner();
  s.start("Applying security profile...");

  const existingConfig = loadConfig();
  const cfg = applyProfile(profile, existingConfig);

  s.stop("Profile applied");

  // Step 4: Optional customization
  await stepCustomizeSettings(cfg);

  // Step 5: Save config
  const saveSpinner = spinner();
  saveSpinner.start("Saving configuration...");
  await new Promise((resolve) => setTimeout(resolve, 500));
  await writeConfigFile(cfg);
  saveSpinner.stop("Configuration saved");

  // Final summary
  const profileConfig = getAllProfiles().find((p) => p.id === profile)!;

  note(
    `${green("✓")} Profile: ${bold(profileConfig.name)} (${profileConfig.badge})\n` +
      `${green("✓")} Security Score: ${bold(String(profileConfig.score))}/100\n` +
      `${green("✓")} Defense Layers: ${bold(String(profileConfig.layers))}/14\n\n` +
      `${dim("Next steps:")}\n` +
      `• Run ${cyan("moltbot gateway")} to start\n` +
      `• Run ${cyan("moltbot setup --secure-extra")} for advanced features\n` +
      `• Run ${cyan("moltbot security-dashboard")} to monitor`,
    "Setup Complete! 🎉",
  );

  outro(green("Moltbot is now configured with Pentagon-level security! 🛡️"));

  log.info("Secure setup completed", {
    profile: profileConfig.name,
    score: profileConfig.score,
    layers: profileConfig.layers,
  });
}
