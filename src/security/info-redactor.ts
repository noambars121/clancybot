/**
 * Sensitive Information Redactor
 * 
 * Addresses OWASP LLM06: Sensitive Information Disclosure
 * 
 * Redacts sensitive information from:
 * - Error messages
 * - Log output
 * - LLM responses
 * - Stack traces
 * - Debug output
 * 
 * @module security/info-redactor
 */

import { getChildLogger } from "../logging.js";
import { homedir } from "node:os";

const log = getChildLogger({ module: "info-redactor" });

// ============================================================================
// Types
// ============================================================================

export type RedactionOptions = {
  redactPaths?: boolean;
  redactCredentials?: boolean;
  redactTokens?: boolean;
  redactIps?: boolean;
  redactEmails?: boolean;
  placeholder?: string;
};

// ============================================================================
// Sensitive Patterns
// ============================================================================

/**
 * API keys and tokens
 */
const TOKEN_PATTERNS = [
  /sk-[a-zA-Z0-9]{48,}/g,  // OpenAI/Anthropic keys
  /ghp_[a-zA-Z0-9]{36,}/g,  // GitHub personal access tokens
  /gho_[a-zA-Z0-9]{36,}/g,  // GitHub OAuth tokens
  /github_pat_[a-zA-Z0-9_]{82}/g,  // GitHub fine-grained PATs
  /glpat-[a-zA-Z0-9_-]{20,}/g,  // GitLab PATs
  /AKIA[0-9A-Z]{16}/g,  // AWS access key IDs
  /[a-zA-Z0-9+/]{40}/g,  // AWS secret access keys (base64, 40 chars)
  /AIza[0-9A-Za-z_-]{35}/g,  // Google API keys
  /ya29\.[0-9A-Za-z_-]+/g,  // Google OAuth tokens
  /xox[baprs]-[0-9a-zA-Z-]+/g,  // Slack tokens
  /[0-9]+-[0-9A-Za-z_]{32}\.apps\.googleusercontent\.com/g,  // Google OAuth client IDs
  /-----BEGIN [A-Z ]+ KEY-----[\s\S]+?-----END [A-Z ]+ KEY-----/g,  // Private keys (PEM)
  /Bearer\s+[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/gi,  // JWT tokens
];

/**
 * Passwords and secrets
 */
const PASSWORD_PATTERNS = [
  /password["\s:=]+["']?([^"'\s]+)["']?/gi,
  /passwd["\s:=]+["']?([^"'\s]+)["']?/gi,
  /secret["\s:=]+["']?([^"'\s]+)["']?/gi,
  /api[-_]?key["\s:=]+["']?([^"'\s]+)["']?/gi,
  /token["\s:=]+["']?([^"'\s]+)["']?/gi,
  /auth["\s:=]+["']?([^"'\s]+)["']?/gi,
];

/**
 * File paths (may contain sensitive info)
 */
const PATH_PATTERNS = [
  /\/home\/[^\/\s]+/g,  // Linux home directories
  /\/Users\/[^\/\s]+/g,  // macOS home directories
  /C:\\Users\\[^\\\/\s]+/gi,  // Windows user directories
  /~\/[^\s]*/g,  // Home directory shortcuts
];

/**
 * IP addresses (internal networks)
 */
const IP_PATTERNS = [
  /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,  // Private 10.x.x.x
  /\b172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b/g,  // Private 172.16-31.x.x
  /\b192\.168\.\d{1,3}\.\d{1,3}\b/g,  // Private 192.168.x.x
  /\b127\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,  // Loopback 127.x.x.x
];

/**
 * Email addresses (PII)
 */
const EMAIL_PATTERNS = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
];

/**
 * Credit card numbers
 */
const CREDIT_CARD_PATTERNS = [
  /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,  // 16-digit cards
  /\b3[47]\d{2}[-\s]?\d{6}[-\s]?\d{5}\b/g,  // Amex
];

/**
 * Social Security Numbers (US)
 */
const SSN_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b\d{9}\b/g,  // 9 consecutive digits (potential SSN)
];

// ============================================================================
// Redaction Functions
// ============================================================================

/**
 * Redact API keys and tokens
 */
export function redactTokens(text: string, placeholder = "[REDACTED_TOKEN]"): string {
  let redacted = text;
  for (const pattern of TOKEN_PATTERNS) {
    redacted = redacted.replace(pattern, placeholder);
  }
  return redacted;
}

/**
 * Redact passwords and secrets
 */
export function redactPasswords(text: string, placeholder = "[REDACTED_SECRET]"): string {
  let redacted = text;
  for (const pattern of PASSWORD_PATTERNS) {
    redacted = redacted.replace(pattern, (match, group1) => {
      // Preserve the key name, redact the value
      return match.replace(group1, placeholder);
    });
  }
  return redacted;
}

/**
 * Redact file paths
 */
export function redactPaths(text: string, placeholder = "[REDACTED_PATH]"): string {
  let redacted = text;
  
  // Replace home directory references
  const home = homedir();
  if (home) {
    redacted = redacted.replace(new RegExp(home.replace(/\\/g, "\\\\"), "g"), "~");
  }

  // Redact other user paths
  for (const pattern of PATH_PATTERNS) {
    redacted = redacted.replace(pattern, placeholder);
  }

  return redacted;
}

/**
 * Redact IP addresses
 */
export function redactIps(text: string, placeholder = "[REDACTED_IP]"): string {
  let redacted = text;
  for (const pattern of IP_PATTERNS) {
    redacted = redacted.replace(pattern, placeholder);
  }
  return redacted;
}

/**
 * Redact email addresses
 */
export function redactEmails(text: string, placeholder = "[REDACTED_EMAIL]"): string {
  let redacted = text;
  for (const pattern of EMAIL_PATTERNS) {
    redacted = redacted.replace(pattern, placeholder);
  }
  return redacted;
}

/**
 * Redact credit card numbers
 */
export function redactCreditCards(text: string, placeholder = "[REDACTED_CARD]"): string {
  let redacted = text;
  for (const pattern of CREDIT_CARD_PATTERNS) {
    redacted = redacted.replace(pattern, placeholder);
  }
  return redacted;
}

/**
 * Redact SSNs
 */
export function redactSsns(text: string, placeholder = "[REDACTED_SSN]"): string {
  let redacted = text;
  for (const pattern of SSN_PATTERNS) {
    redacted = redacted.replace(pattern, placeholder);
  }
  return redacted;
}

/**
 * Redact stack traces (remove file paths)
 */
export function redactStackTrace(stackTrace: string): string {
  let redacted = stackTrace;

  // Redact file paths in stack traces
  redacted = redactPaths(redacted);

  // Redact line:column references (keep relative)
  redacted = redacted.replace(/at\s+[^\s]+\s+\([^)]+\)/g, (match) => {
    // Keep function name, redact full path
    const functionMatch = match.match(/at\s+([^\s]+)/);
    if (functionMatch) {
      return `at ${functionMatch[1]} ([REDACTED_PATH])`;
    }
    return "at [REDACTED]";
  });

  return redacted;
}

/**
 * Comprehensive redaction
 */
export function redactSensitiveInfo(
  text: string,
  options: RedactionOptions = {},
): string {
  const {
    redactPaths: shouldRedactPaths = true,
    redactCredentials = true,
    redactTokens: shouldRedactTokens = true,
    redactIps: shouldRedactIps = true,
    redactEmails: shouldRedactEmails = true,
    placeholder = "[REDACTED]",
  } = options;

  let redacted = text;

  if (shouldRedactTokens) {
    redacted = redactTokens(redacted, placeholder);
  }

  if (redactCredentials) {
    redacted = redactPasswords(redacted, placeholder);
    redacted = redactCreditCards(redacted, placeholder);
    redacted = redactSsns(redacted, placeholder);
  }

  if (shouldRedactPaths) {
    redacted = redactPaths(redacted, placeholder);
  }

  if (shouldRedactIps) {
    redacted = redactIps(redacted, placeholder);
  }

  if (shouldRedactEmails) {
    redacted = redactEmails(redacted, placeholder);
  }

  return redacted;
}

/**
 * Redact error message
 */
export function redactError(error: Error | unknown): Error {
  if (!(error instanceof Error)) {
    return new Error("[Redacted error]");
  }

  const redactedMessage = redactSensitiveInfo(error.message);
  const redactedStack = error.stack ? redactStackTrace(error.stack) : undefined;

  const redactedError = new Error(redactedMessage);
  redactedError.name = error.name;
  redactedError.stack = redactedStack;

  return redactedError;
}

/**
 * Check if text contains sensitive information
 */
export function containsSensitiveInfo(text: string): boolean {
  // Check for tokens
  for (const pattern of TOKEN_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }

  // Check for passwords
  for (const pattern of PASSWORD_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }

  // Check for credit cards
  for (const pattern of CREDIT_CARD_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }

  // Check for SSNs
  for (const pattern of SSN_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}

/**
 * Log redaction warning
 */
export function logRedaction(context: string, detected: string[]) {
  log.warn("Sensitive information redacted", {
    context,
    detectedTypes: detected,
  });
}

// ============================================================================
// Export
// ============================================================================

export const InfoRedactor = {
  redactTokens,
  redactPasswords,
  redactPaths,
  redactIps,
  redactEmails,
  redactCreditCards,
  redactSsns,
  redactStackTrace,
  redactSensitiveInfo,
  redactError,
  containsSensitiveInfo,
  logRedaction,
};
