/**
 * Profile Selection Command
 *
 * Commands:
 * - moltbot profile select [profile] - Select security profile
 * - moltbot profile show - Show current profile
 * - moltbot profile list - List all profiles
 * - moltbot profile compare <a> <b> - Compare profiles
 *
 * @see Phase 10 - Pentagon++++ Security
 */

import { intro, outro, select, confirm, note, spinner } from "@clack/prompts";
import { bold, cyan, green, yellow, red, dim } from "kleur/colors";
import {
  type SecurityProfile,
  getAllProfiles,
  getProfile,
  applyProfile,
  getCurrentProfile,
  validateProfile,
  compareProfiles,
  getProfileSummary,
  getRecommendedProfile,
} from "../config/security-profiles.js";
import { loadConfig, saveConfig } from "../config/config.js";
import { log } from "../common/log.js";

// ============================================================================
// Select Profile Command
// ============================================================================

export async function selectProfileCommand(profileId?: SecurityProfile): Promise<void> {
  intro(bold(cyan("🎯 Security Profile Selection")));

  let profile: SecurityProfile;

  if (profileId) {
    // Profile specified via CLI
    profile = profileId;
  } else {
    // Interactive selection
    const profiles = getAllProfiles();

    profile = (await select({
      message: "Select security profile:",
      options: profiles.map((p) => ({
        value: p.id,
        label: `${p.name} (${p.badge})`,
        hint: p.description + ` | Score: ${p.score}/100, Layers: ${p.layers}/14`,
      })),
      initialValue: getRecommendedProfile().id,
    })) as SecurityProfile;
  }

  if (!profile) {
    outro(dim("Cancelled"));
    return;
  }

  const profileConfig = getProfile(profile);

  // Display profile details
  note(
    `${bold(profileConfig.name)} (${profileConfig.badge})\n\n` +
      `${profileConfig.description}\n\n` +
      `Security Score: ${bold(String(profileConfig.score))}/100\n` +
      `Defense Layers: ${bold(String(profileConfig.layers))}/14`,
    "Profile Details"
  );

  // Validate requirements
  const s = spinner();
  s.start("Validating requirements...");

  const validation = await validateProfile(profile);

  s.stop(validation.valid ? "Validation passed ✅" : "Validation failed ❌");

  // Show errors
  if (validation.errors.length > 0) {
    note(
      red(validation.errors.join("\n")),
      "❌ Requirements Not Met"
    );
    outro(red("Cannot apply this profile. Fix the errors above."));
    return;
  }

  // Show warnings
  if (validation.warnings.length > 0) {
    note(
      yellow(validation.warnings.join("\n")),
      "⚠️ Warnings"
    );

    const proceed = await confirm({
      message: "Continue despite warnings?",
      initialValue: profile !== "development",
    });

    if (!proceed) {
      outro(dim("Cancelled"));
      return;
    }
  }

  // Confirm application
  const confirmed = await confirm({
    message: `Apply ${profileConfig.name} profile?`,
    initialValue: true,
  });

  if (!confirmed) {
    outro(dim("Cancelled"));
    return;
  }

  // Apply profile
  s.start("Applying profile...");

  const existingConfig = loadConfig();
  const newConfig = applyProfile(profile, existingConfig);
  saveConfig(newConfig);

  s.stop("Profile applied ✅");

  log.info("Security profile applied", {
    profile: profileConfig.name,
    badge: profileConfig.badge,
  });

  outro(
    green(
      bold(
        `✅ Profile applied: ${profileConfig.name}\n\n` +
          `Security Score: ${profileConfig.score}/100\n` +
          `Defense Layers: ${profileConfig.layers}/14\n\n` +
          `${dim("Restart gateway for changes to take effect:")}\n` +
          `${cyan("moltbot gateway restart")}`
      )
    )
  );
}

// ============================================================================
// Show Current Profile Command
// ============================================================================

export async function showProfileCommand(): Promise<void> {
  intro(bold(cyan("📊 Current Security Profile")));

  const config = loadConfig();
  const currentProfile = getCurrentProfile(config);

  if (!currentProfile) {
    note(
      yellow(
        "No security profile selected.\n\n" +
          `Run: ${cyan("moltbot profile select")}`
      ),
      "Not Configured"
    );
    outro(dim("Done"));
    return;
  }

  const profileConfig = getProfile(currentProfile);

  console.log(`\n${bold(profileConfig.name)} (${profileConfig.badge})\n`);
  console.log(`${profileConfig.description}\n`);
  console.log(`Security Score: ${bold(green(String(profileConfig.score)))}/100`);
  console.log(`Defense Layers: ${bold(green(String(profileConfig.layers)))}/14\n`);

  // Show configuration details
  const metadata = (config.security as any)?.profile;
  if (metadata?.appliedAt) {
    console.log(`${dim("Applied:")} ${new Date(metadata.appliedAt).toLocaleString()}\n`);
  }

  // Show warnings
  if (profileConfig.warnings && profileConfig.warnings.length > 0) {
    note(yellow(profileConfig.warnings.join("\n")), "Active Warnings");
  }

  outro(dim("Done"));
}

// ============================================================================
// List Profiles Command
// ============================================================================

export async function listProfilesCommand(): Promise<void> {
  intro(bold(cyan("📋 Available Security Profiles")));

  const profiles = getAllProfiles();
  const current = getCurrentProfile(loadConfig());

  console.log();

  for (const profile of profiles) {
    const isCurrent = current === profile.id;
    const marker = isCurrent ? green("●") : dim("○");

    console.log(
      `${marker} ${bold(profile.name)} (${profile.badge})${profile.recommended ? " " + yellow("[RECOMMENDED]") : ""}`
    );
    console.log(`  ${profile.description}`);
    console.log(
      `  ${dim("Score:")} ${profile.score}/100  ${dim("Layers:")} ${profile.layers}/14`
    );
    console.log();
  }

  outro(
    dim(
      `Select a profile: ${cyan("moltbot profile select [profile]")}\n` +
        `Show current: ${cyan("moltbot profile show")}`
    )
  );
}

// ============================================================================
// Compare Profiles Command
// ============================================================================

export async function compareProfilesCommand(
  profileA: SecurityProfile,
  profileB: SecurityProfile
): Promise<void> {
  intro(bold(cyan("⚖️ Profile Comparison")));

  const configA = getProfile(profileA);
  const configB = getProfile(profileB);
  const comparison = compareProfiles(profileA, profileB);

  console.log(`\n${bold("Profile A:")} ${configA.name} (${configA.badge})`);
  console.log(`Security Score: ${configA.score}/100`);
  console.log(`Defense Layers: ${configA.layers}/14\n`);

  console.log(`${bold("Profile B:")} ${configB.name} (${configB.badge})`);
  console.log(`Security Score: ${configB.score}/100`);
  console.log(`Defense Layers: ${configB.layers}/14\n`);

  console.log(`${bold("Comparison:")}`);
  console.log(
    `Score Difference: ${comparison.scoreDiff > 0 ? green(`+${comparison.scoreDiff}`) : red(String(comparison.scoreDiff))} (A vs B)`
  );
  console.log(
    `Layers Difference: ${comparison.layersDiff > 0 ? green(`+${comparison.layersDiff}`) : red(String(comparison.layersDiff))} (A vs B)`
  );
  console.log(
    `More Secure: ${bold(getProfile(comparison.moreSecure).name)}\n`
  );

  outro(dim("Done"));
}
