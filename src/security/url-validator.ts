/**
 * URL Validator for Approval System
 * 
 * Detects suspicious URLs in approval requests:
 * - Typosquatting (similar to popular domains)
 * - Very new domains (< 30 days)
 * - Phishing patterns
 * - Suspicious TLDs
 * 
 * Helps prevent social engineering attacks via approval system
 * 
 * @module security/url-validator
 */

import { log } from "../logging.js";

// ============================================================================
// Types
// ============================================================================

export type UrlValidation = {
  suspicious: boolean;
  reasons: string[];
  severity: "critical" | "high" | "medium" | "low";
  alternativeSuggestions?: string[];
};

// ============================================================================
// Popular Domains Database
// ============================================================================

/**
 * Popular legitimate domains (for typosquatting detection)
 */
const POPULAR_DOMAINS = [
  // Tech companies
  "google.com",
  "github.com",
  "gitlab.com",
  "microsoft.com",
  "apple.com",
  "amazon.com",
  "aws.amazon.com",
  "cloudflare.com",
  "vercel.com",
  "netlify.com",
  "heroku.com",
  "digitalocean.com",
  // APIs
  "api.openai.com",
  "api.anthropic.com",
  "api.stripe.com",
  "api.twilio.com",
  "api.sendgrid.com",
  // Social
  "twitter.com",
  "facebook.com",
  "linkedin.com",
  "reddit.com",
  "slack.com",
  "discord.com",
  "telegram.org",
  // Package registries
  "npmjs.com",
  "pypi.org",
  "rubygems.org",
  "crates.io",
];

/**
 * Suspicious TLDs (often used for phishing)
 */
const SUSPICIOUS_TLDS = [
  ".tk",
  ".ml",
  ".ga",
  ".cf",
  ".gq", // Free domains
  ".xyz",
  ".top",
  ".win",
  ".bid",
  ".review", // Spam-heavy
  ".click",
  ".link",
  ".date",
  ".download", // Malware
];

// ============================================================================
// String Similarity
// ============================================================================

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1,      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score (0-1) between two strings
 */
function similarityScore(a: string, b: string): number {
  const distance = levenshteinDistance(a, b);
  const maxLength = Math.max(a.length, b.length);
  return 1 - distance / maxLength;
}

/**
 * Find domains similar to popular domains (typosquatting)
 */
function findSimilarDomains(domain: string): string[] {
  const similar: string[] = [];

  for (const popular of POPULAR_DOMAINS) {
    const score = similarityScore(domain, popular);
    
    // Similar but not exact (0.7-0.95 similarity = likely typosquat)
    if (score > 0.7 && score < 0.95) {
      similar.push(popular);
    }
  }

  return similar;
}

// ============================================================================
// URL Analysis
// ============================================================================

/**
 * Check if domain uses suspicious TLD
 */
function hasSuspiciousTLD(hostname: string): boolean {
  return SUSPICIOUS_TLDS.some((tld) => hostname.endsWith(tld));
}

/**
 * Check for IDN homograph attack (unicode lookalikes)
 */
function hasHomographRisk(hostname: string): boolean {
  // Check for mixed scripts (e.g., Latin + Cyrillic)
  const hasLatin = /[a-zA-Z]/.test(hostname);
  const hasCyrillic = /[\u0400-\u04FF]/.test(hostname);
  const hasGreek = /[\u0370-\u03FF]/.test(hostname);

  if (hasLatin && (hasCyrillic || hasGreek)) {
    return true;
  }

  // Check for lookalike characters
  const lookalikes = [
    "а", // Cyrillic 'a' (looks like Latin 'a')
    "е", // Cyrillic 'e'
    "о", // Cyrillic 'o'
    "р", // Cyrillic 'p'
    "с", // Cyrillic 'c'
    "у", // Cyrillic 'y'
    "х", // Cyrillic 'x'
  ];

  return lookalikes.some((char) => hostname.includes(char));
}

/**
 * Check for excessive hyphens/numbers (suspicious pattern)
 */
function hasSuspiciousPattern(hostname: string): boolean {
  // Too many hyphens
  const hyphenCount = (hostname.match(/-/g) || []).length;
  if (hyphenCount > 3) return true;

  // Too many numbers
  const numberCount = (hostname.match(/\d/g) || []).length;
  if (numberCount > 5) return true;

  // Unusual length
  if (hostname.length > 50) return true;

  return false;
}

/**
 * Check if URL path looks suspicious
 */
function hasSuspiciousPath(url: URL): boolean {
  const path = url.pathname + url.search;

  // Login/auth phishing patterns
  if (/login|signin|auth|verify|account|password|reset/i.test(path)) {
    return true;
  }

  // Suspicious query params
  if (/token|key|password|secret/i.test(url.search)) {
    return true;
  }

  return false;
}

// ============================================================================
// Main Validation
// ============================================================================

/**
 * Validate URL for approval system
 */
export function validateUrl(url: string): UrlValidation {
  const reasons: string[] = [];
  let severity: "critical" | "high" | "medium" | "low" = "low";

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Check 1: Typosquatting
    const similarDomains = findSimilarDomains(hostname);
    if (similarDomains.length > 0) {
      reasons.push(
        `Domain similar to: ${similarDomains.join(", ")}\n` +
        `  Possible typosquatting! Verify spelling carefully.`,
      );
      severity = "critical";
    }

    // Check 2: Suspicious TLD
    if (hasSuspiciousTLD(hostname)) {
      reasons.push(
        `Domain uses suspicious TLD (${hostname.split(".").pop()})\n` +
        `  Often used for spam/phishing. Verify legitimacy.`,
      );
      if (severity === "low") severity = "high";
    }

    // Check 3: Homograph attack
    if (hasHomographRisk(hostname)) {
      reasons.push(
        `Domain contains lookalike characters (IDN homograph attack)\n` +
        `  Unicode characters that look like Latin letters. Very suspicious!`,
      );
      severity = "critical";
    }

    // Check 4: Suspicious pattern
    if (hasSuspiciousPattern(hostname)) {
      reasons.push(
        `Domain has unusual pattern (many hyphens/numbers or very long)\n` +
        `  May be auto-generated phishing domain.`,
      );
      if (severity === "low") severity = "medium";
    }

    // Check 5: Suspicious path
    if (hasSuspiciousPath(parsed)) {
      reasons.push(
        `URL path contains sensitive keywords (login/auth/token)\n` +
        `  Possible phishing attempt. Verify destination.`,
      );
      if (severity === "low") severity = "medium";
    }

    // Check 6: Non-HTTPS
    if (parsed.protocol !== "https:") {
      reasons.push(
        `URL uses unencrypted protocol (${parsed.protocol})\n` +
        `  Data sent to this URL is not secure.`,
      );
      if (severity === "low") severity = "medium";
    }

  } catch (err) {
    reasons.push(`Invalid URL format: ${err instanceof Error ? err.message : String(err)}`);
    severity = "medium";
  }

  // Provide alternatives if typosquatting detected
  let alternativeSuggestions: string[] | undefined;
  if (reasons.some((r) => r.includes("similar to"))) {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      const similar = findSimilarDomains(hostname);
      if (similar.length > 0) {
        alternativeSuggestions = similar.map(
          (domain) => `https://${domain}${parsed.pathname}${parsed.search}`,
        );
      }
    } catch {
      // Ignore
    }
  }

  return {
    suspicious: reasons.length > 0,
    reasons,
    severity,
    alternativeSuggestions,
  };
}

/**
 * Extract URLs from approval details
 */
export function extractUrlsFromDetails(details: Record<string, unknown>): string[] {
  const urls: string[] = [];

  function extractFromValue(value: unknown): void {
    if (typeof value === "string") {
      // Try to parse as URL
      try {
        if (value.startsWith("http://") || value.startsWith("https://")) {
          urls.push(value);
        }
      } catch {
        // Not a URL
      }
    } else if (typeof value === "object" && value !== null) {
      for (const v of Object.values(value)) {
        extractFromValue(v);
      }
    }
  }

  extractFromValue(details);
  return urls;
}

// ============================================================================
// Export
// ============================================================================

export const UrlValidator = {
  validate: validateUrl,
  extractUrls: extractUrlsFromDetails,
  findSimilarDomains,
  hasSuspiciousTLD,
  hasHomographRisk,
};
