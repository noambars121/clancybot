/**
 * Full Onboarding Wizard
 *
 * Comprehensive interactive wizard using Moltbot's existing onboarding system
 * with added security profile selection.
 *
 * Usage: clancybot onboard-full
 *        clancybot setup --full
 *
 * @module commands/onboard-full
 */

import { readConfigFileSnapshot, writeConfigFile } from "../config/config.js";
import { getChildLogger } from "../logging.js";
import {
  type SecurityProfile,
  applyProfile,
  getAllProfiles,
} from "../config/security-profiles.js";
import { createClackPrompter } from "../wizard/clack-prompter.js";
import { runOnboardingWizard } from "../wizard/onboarding.js";
import { WizardCancelledError } from "../wizard/prompts.js";
import { defaultRuntime } from "../runtime.js";
import type { OnboardOptions } from "./onboard-types.js";

const log = getChildLogger({ module: "onboard-full" });

/**
 * Full Onboarding Wizard - Enhanced with Security Profiles
 *
 * Runs the complete Moltbot onboarding wizard, then adds security profile selection.
 */
export async function runFullOnboarding(): Promise<void> {
  const runtime = defaultRuntime;
  const prompter = createClackPrompter();

  try {
    await prompter.intro("🚀 Moltbot Full Setup Wizard");

    // Step 1: Run standard Moltbot onboarding (auth, channels, skills, gateway)
    const opts: OnboardOptions = {
      flow: "advanced", // Use advanced mode for full control
    };

    await runOnboardingWizard(opts, runtime, prompter);

    // Step 2: Add security profile selection
    const snapshot = await readConfigFileSnapshot();
    if (!snapshot.valid) {
      await prompter.outro("❌ Config invalid after onboarding. Run 'clancybot doctor --fix'.");
      return;
    }

    let config = snapshot.config;

    const profiles = getAllProfiles();
    const securityProfile = (await prompter.select({
      message: "🔒 Select Security Profile:",
      options: profiles.map((profile) => ({
        value: profile.id,
        label: `${profile.name} (${profile.score}/100)`,
        hint: profile.description,
      })),
      initialValue: "balanced",
    })) as SecurityProfile;

    if (!securityProfile || typeof securityProfile === "symbol") {
      await prompter.outro("Setup cancelled at security profile selection");
      return;
    }

    // Apply security profile
    config = applyProfile(securityProfile, config);

    // Write final config
    await writeConfigFile(config);

    // Summary
    const selectedProfile = profiles.find((p) => p.id === securityProfile);
    await prompter.note(
      `Security Profile: ${selectedProfile?.name}\n` +
        `Score: ${selectedProfile?.score}/100\n` +
        `Layers: ${selectedProfile?.layers}`,
      "📋 Security Summary"
    );

    await prompter.outro("🎉 Setup complete! Run 'clancybot gateway run' to start.");
  } catch (error) {
    if (error instanceof WizardCancelledError) {
      runtime.exit(0);
      return;
    }
    log.error("Setup failed:", error);
    throw error;
  }
}
