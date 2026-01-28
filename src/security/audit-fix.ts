import { randomBytes } from "node:crypto";
import type { SecurityAuditFinding } from "./audit.js";
import { enforceSecurePermissions } from "./permission-enforcer.js";
import type { MoltbotConfig } from "../config/config.js";

export interface FixResult {
  finding: SecurityAuditFinding;
  fixed: boolean;
  message?: string;
  error?: string;
}

export function isAutoFixable(finding: SecurityAuditFinding): boolean {
  const fixableIds = [
    'fs.state_dir.perms_world_writable',
    'fs.state_dir.perms_group_writable',
    'fs.state_dir.perms_readable',
    'fs.config.perms_writable',
    'fs.config.perms_world_readable',
    'fs.config.perms_group_readable',
    'gateway.token_too_short',
    'logging.redact_off',
  ];
  
  return fixableIds.includes(finding.checkId);
}

export function generateSecureToken(length: number): string {
  const bytes = randomBytes(Math.ceil(length * 0.75)); // Base64 expansion
  return bytes.toString('base64url').slice(0, length);
}

export async function applyFix(
  finding: SecurityAuditFinding,
  config: MoltbotConfig
): Promise<FixResult> {
  try {
    switch (finding.checkId) {
      case 'fs.state_dir.perms_world_writable':
      case 'fs.state_dir.perms_group_writable':
      case 'fs.state_dir.perms_readable':
      case 'fs.config.perms_writable':
      case 'fs.config.perms_world_readable':
      case 'fs.config.perms_group_readable': {
        const fixed = await enforceSecurePermissions();
        return {
          finding,
          fixed: true,
          message: `Fixed permissions on ${fixed} paths`,
        };
      }
      
      case 'gateway.token_too_short': {
        const newToken = generateSecureToken(32);
        return {
          finding,
          fixed: true,
          message: `Generated new token (save this): ${newToken}\n` +
                   `Add to config: gateway.auth.token="${newToken}"\n` +
                   `Or set env: CLAWDBOT_GATEWAY_TOKEN="${newToken}"`,
        };
      }
      
      case 'logging.redact_off': {
        if (!config.logging) config.logging = {};
        config.logging.redactSensitive = 'tools';
        return {
          finding,
          fixed: true,
          message: 'Set logging.redactSensitive="tools" (config object updated in memory)',
        };
      }
      
      default:
        return {
          finding,
          fixed: false,
          error: 'Not auto-fixable - requires manual intervention',
        };
    }
  } catch (error) {
    return {
      finding,
      fixed: false,
      error: String(error),
    };
  }
}
