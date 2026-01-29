import type { Command } from "commander";

import { runFullOnboarding } from "../../commands/onboard-full.js";

export function registerOnboardFullCommand(program: Command) {
  program
    .command("onboard-full")
    .description("Complete interactive setup wizard (AI, channels, skills, security)")
    .action(async () => {
      await runFullOnboarding();
    });
}
