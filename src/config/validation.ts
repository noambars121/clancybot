import type { MoltbotConfig } from "./config.js";

export class ConfigValidationError extends Error {
  constructor(message: string, public readonly path: string) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

export function validateDmPolicy(policy: unknown, path: string): void {
  if (policy === 'open') {
    throw new ConfigValidationError(
      `dmPolicy="open" is no longer supported for security reasons. ` +
      `This option allowed anyone to DM your bot, which is a critical security risk. ` +
      `Please use "pairing" (recommended) or "allowlist" instead. ` +
      `Migration guide: docs/security/breaking-changes-phase1.md`,
      path
    );
  }
}

export function validateChannelConfig(config: MoltbotConfig): void {
  // Check channels.defaults
  const defaults = config.channels?.defaults as any;
  if (defaults?.dmPolicy) {
    validateDmPolicy(defaults.dmPolicy, 'channels.defaults.dmPolicy');
  }

  // Check each channel - note: this is a simplified check
  // Full implementation would need to check each channel's specific structure
  const channels = config.channels ?? {};
  for (const [channelId, channelConfig] of Object.entries(channels)) {
    if (channelId === 'defaults') continue;
    if (!channelConfig || typeof channelConfig !== 'object') continue;
    
    // Check various possible DM policy locations
    const ch = channelConfig as Record<string, unknown>;
    if (ch.dmPolicy) {
      validateDmPolicy(ch.dmPolicy, `channels.${channelId}.dmPolicy`);
    }
    if (ch.dm && typeof ch.dm === 'object') {
      const dm = ch.dm as Record<string, unknown>;
      if (dm.policy) {
        validateDmPolicy(dm.policy, `channels.${channelId}.dm.policy`);
      }
    }
  }
}

// Export these functions to satisfy config.ts exports
export function validateConfigObject(config: MoltbotConfig): void {
  validateChannelConfig(config);
}

export function validateConfigObjectWithPlugins(config: MoltbotConfig): void {
  validateChannelConfig(config);
}
