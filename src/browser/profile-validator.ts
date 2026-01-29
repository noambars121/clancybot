/**
 * Browser Profile Validator - Phase 6
 * 
 * Prevents HACK #4 from Chirag's article: Browser Session Hijacking
 * 
 * Attack Vector:
 * - User gives bot access to default Chrome profile (logged into everything)
 * - Attacker asks bot to "check Gmail for password reset code"
 * - Bot opens authenticated Gmail, reads 2FA codes
 * - Attacker takes over: Google, Apple ID, 50+ accounts
 * 
 * Solution:
 * - Block default/authenticated profiles
 * - Require dedicated bot profile
 * - Verify profile is clean (no sessions)
 * 
 * GitHub Issue: Chirag's Hack #4
 */

import fs from "node:fs";
import path from "node:path";
import { getChildLogger } from "../logging/logger.js";

const log = getChildLogger({ module: "browser-profile-validator" });

export interface BrowserProfileValidationResult {
  valid: boolean;
  reason?: string;
  warnings?: string[];
}

/**
 * Default profile names to block (common across browsers)
 */
const BLOCKED_PROFILE_NAMES = [
  "default",
  "Default",
  "profile 1",
  "Profile 1",
  "person 1",
  "Person 1",
  "user",
  "User",
  "main",
  "Main",
];

/**
 * Check if profile name is blocked (default/system profile)
 */
export function isBlockedProfileName(profileName: string): boolean {
  const normalized = profileName.trim().toLowerCase();
  
  for (const blocked of BLOCKED_PROFILE_NAMES) {
    if (normalized === blocked.toLowerCase()) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if profile directory has active sessions
 * Looks for cookies, session storage, local storage
 */
export function hasActiveSessions(profilePath: string): boolean {
  if (!fs.existsSync(profilePath)) {
    return false;
  }
  
  const sessionIndicators = [
    "Cookies",
    "Cookies-journal",
    "Local Storage",
    "Session Storage",
    "IndexedDB",
    "Service Worker",
  ];
  
  for (const indicator of sessionIndicators) {
    const indicatorPath = path.join(profilePath, indicator);
    if (fs.existsSync(indicatorPath)) {
      // Check if file/dir is non-empty
      const stat = fs.statSync(indicatorPath);
      if (stat.isDirectory()) {
        const files = fs.readdirSync(indicatorPath);
        if (files.length > 0) {
          return true;
        }
      } else if (stat.size > 0) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Get profile warnings (non-blocking but suspicious)
 */
export function getProfileWarnings(profilePath: string): string[] {
  const warnings: string[] = [];
  
  if (!fs.existsSync(profilePath)) {
    return warnings;
  }
  
  // Check for large cookies file (indicates active use)
  const cookiesPath = path.join(profilePath, "Cookies");
  if (fs.existsSync(cookiesPath)) {
    const stat = fs.statSync(cookiesPath);
    if (stat.size > 100_000) {
      // > 100KB cookies = likely has active sessions
      warnings.push(
        `Large Cookies file (${Math.round(stat.size / 1024)}KB) - ` +
        `may contain active sessions`
      );
    }
  }
  
  // Check for History
  const historyPath = path.join(profilePath, "History");
  if (fs.existsSync(historyPath)) {
    warnings.push("Profile has browsing history - consider using clean profile");
  }
  
  // Check for Preferences (indicates profile has been used)
  const prefsPath = path.join(profilePath, "Preferences");
  if (fs.existsSync(prefsPath)) {
    try {
      const prefs = JSON.parse(fs.readFileSync(prefsPath, "utf-8"));
      if (prefs?.profile?.name) {
        warnings.push(`Profile name: ${prefs.profile.name}`);
      }
    } catch {
      // Ignore parse errors
    }
  }
  
  return warnings;
}

/**
 * Validate browser profile for security
 * 
 * Blocks:
 * - Default/system profiles (e.g. "Default", "Profile 1")
 * - Profiles with active sessions
 * 
 * Recommends:
 * - Create dedicated profile for bot
 * - Use clean profile (no cookies/history)
 */
export function validateBrowserProfile(
  profileName: string,
  profilePath?: string,
): BrowserProfileValidationResult {
  // Check 1: Block default profile names
  if (isBlockedProfileName(profileName)) {
    log.warn(`Blocked browser profile: ${profileName} (default/system profile)`);
    return {
      valid: false,
      reason:
        `Security: Cannot use default browser profile "${profileName}". ` +
        `Default profiles are typically logged into personal accounts. ` +
        `Create a dedicated profile for ClancyBot: ` +
        `chrome://settings/manageProfile (Chrome) or about:profiles (Firefox)`,
    };
  }
  
  // Check 2: If path provided, check for active sessions
  if (profilePath) {
    if (hasActiveSessions(profilePath)) {
      log.warn(`Blocked browser profile: ${profileName} (has active sessions)`);
      return {
        valid: false,
        reason:
          `Security: Browser profile "${profileName}" has active sessions. ` +
          `Using authenticated profiles exposes your accounts to potential hijacking. ` +
          `Create a new, clean profile for ClancyBot with no existing logins.`,
      };
    }
    
    // Check 3: Get warnings (non-blocking)
    const warnings = getProfileWarnings(profilePath);
    if (warnings.length > 0) {
      log.info(`Browser profile warnings for ${profileName}:`, warnings);
      return {
        valid: true,
        warnings,
      };
    }
  }
  
  // All checks passed
  log.info(`Browser profile validated: ${profileName}`);
  return { valid: true };
}

/**
 * Validate browser profile from config
 */
export function validateBrowserProfileFromConfig(
  profile: string | undefined,
  profilePath: string | undefined,
): void {
  if (!profile) {
    // No profile configured - OK (will use default behavior)
    return;
  }
  
  const result = validateBrowserProfile(profile, profilePath);
  
  if (!result.valid) {
    throw new Error(result.reason);
  }
  
  if (result.warnings && result.warnings.length > 0) {
    for (const warning of result.warnings) {
      log.warn(`Browser profile warning: ${warning}`);
    }
  }
}
