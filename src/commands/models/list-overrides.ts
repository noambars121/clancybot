/**
 * List Session Model Overrides - CLI Command
 * 
 * Shows which sessions have model overrides.
 * Helps debug model switching issues (GitHub #3370)
 * 
 * Usage:
 * - moltbot models list-overrides
 */

import { loadConfig } from "../../config/config.js";
import { listSessionModelOverrides } from "../../agents/session-model-override.js";
import { info } from "../../globals.js";
import { defaultRuntime, type RuntimeEnv } from "../../runtime.js";

export async function listModelOverridesCommand(
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const cfg = loadConfig();
  const overrides = listSessionModelOverrides(cfg);
  
  if (overrides.length === 0) {
    runtime.log(info("No session model overrides found"));
    runtime.log(info("\nAll sessions use the default model from config."));
    return;
  }
  
  runtime.log(
    info(`Found ${overrides.length} session(s) with model overrides:\n`)
  );
  
  for (const { sessionKey, override } of overrides) {
    runtime.log(
      info(`  ${sessionKey}:\n    ${override.provider}/${override.model}`)
    );
  }
  
  runtime.log(
    info(`\nTo clear overrides, run: moltbot models clear-overrides`)
  );
}
