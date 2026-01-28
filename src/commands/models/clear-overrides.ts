/**
 * Clear Session Model Overrides - CLI Command
 * 
 * Addresses GitHub Issue #3370: Model switching runtime issues
 * 
 * Usage:
 * - moltbot models clear-overrides           (all sessions)
 * - moltbot models clear-overrides default   (specific session)
 */

import { loadConfig } from "../../config/config.js";
import {
  clearAllSessionModelOverrides,
  clearSessionModelOverride,
  listSessionModelOverrides,
} from "../../agents/session-model-override.js";
import { info, success } from "../../globals.js";
import { defaultRuntime, type RuntimeEnv } from "../../runtime.js";

export async function clearModelOverridesCommand(
  sessionKey?: string,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const cfg = loadConfig();
  
  if (sessionKey) {
    // Clear specific session
    const result = await clearSessionModelOverride(cfg, sessionKey);
    
    if (!result.cleared) {
      runtime.log(info(`No model override found for session: ${sessionKey}`));
      return;
    }
    
    runtime.log(
      success(
        `Cleared model override for session ${sessionKey}:\n` +
        `  ${result.previousOverride!.provider}/${result.previousOverride!.model}`
      )
    );
  } else {
    // Clear all sessions
    const overrides = listSessionModelOverrides(cfg);
    
    if (overrides.length === 0) {
      runtime.log(info("No session model overrides found"));
      return;
    }
    
    runtime.log(
      info(`Found ${overrides.length} session(s) with model overrides:\n` +
        overrides.map((o) => 
          `  - ${o.sessionKey}: ${o.override.provider}/${o.override.model}`
        ).join("\n")
      )
    );
    
    const result = await clearAllSessionModelOverrides(cfg);
    
    runtime.log(
      success(`Cleared model overrides for ${result.clearedCount} session(s)`)
    );
  }
}
