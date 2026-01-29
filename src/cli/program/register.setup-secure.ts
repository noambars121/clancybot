import type { Command } from "commander";

import { runSecureSetup } from "../../commands/setup-secure.js";

export function registerSetupSecureCommand(program: Command) {
  program
    .command("setup-secure")
    .description("Interactive security setup wizard (Pentagon level)")
    .action(async () => {
      await runSecureSetup();
    });
}
