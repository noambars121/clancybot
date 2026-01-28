/**
 * PII Detection - Identify personally identifiable information
 *
 * Detects:
 * - Credit cards
 * - SSN (US Social Security Numbers)
 * - Phone numbers
 * - Email addresses
 * - IP addresses
 * - Dates of birth
 * - Physical addresses
 * - Names (using common patterns)
 *
 * Uses regex patterns for fast detection.
 * For production, consider ML-based NER (Named Entity Recognition).
 *
 * @see Phase 9 - Pentagon+++ Security
 */

// ============================================================================
// Types
// ============================================================================

export type PIIType =
  | "CREDIT_CARD"
  | "SSN"
  | "PHONE"
  | "EMAIL"
  | "IP_ADDRESS"
  | "DATE_OF_BIRTH"
  | "ADDRESS"
  | "NAME"
  | "PASSPORT"
  | "DRIVER_LICENSE";

export type PIIEntity = {
  type: PIIType;
  value: string; // The detected PII
  start: number; // Start position in text
  end: number; // End position in text
  confidence: number; // 0.0 - 1.0
};

export type PIIScanResult = {
  hasPII: boolean;
  entities: PIIEntity[];
  sensitivityScore: number; // 0-100 (higher = more sensitive)
};

// ============================================================================
// PII Patterns (Regex)
// ============================================================================

const PII_PATTERNS: Record<PIIType, RegExp[]> = {
  // Credit Card Numbers (Visa, MasterCard, Amex, Discover)
  CREDIT_CARD: [
    /\b(?:4[0-9]{12}(?:[0-9]{3})?)\b/g, // Visa
    /\b(?:5[1-5][0-9]{14})\b/g, // MasterCard
    /\b(?:3[47][0-9]{13})\b/g, // Amex
    /\b(?:6(?:011|5[0-9]{2})[0-9]{12})\b/g, // Discover
    /\b(?:[0-9]{4}[\s-]?[0-9]{4}[\s-]?[0-9]{4}[\s-]?[0-9]{4})\b/g, // Generic with separators
  ],

  // US Social Security Numbers
  SSN: [
    /\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b/g, // XXX-XX-XXXX
    /\b[0-9]{9}\b/g, // XXXXXXXXX (9 digits, might have false positives)
  ],

  // Phone Numbers (US and international)
  PHONE: [
    /\b(?:\+?1[\s.-]?)?\(?[0-9]{3}\)?[\s.-]?[0-9]{3}[\s.-]?[0-9]{4}\b/g, // US: +1 (123) 456-7890
    /\b\+[0-9]{1,3}[\s.-]?[0-9]{1,14}\b/g, // International: +XX ...
  ],

  // Email Addresses
  EMAIL: [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g],

  // IP Addresses (IPv4 and IPv6)
  IP_ADDRESS: [
    /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g, // IPv4
    /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g, // IPv6
  ],

  // Dates of Birth
  DATE_OF_BIRTH: [
    /\b(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12][0-9]|3[01])\/(?:19|20)[0-9]{2}\b/g, // MM/DD/YYYY
    /\b(?:19|20)[0-9]{2}-(?:0?[1-9]|1[0-2])-(?:0?[1-9]|[12][0-9]|3[01])\b/g, // YYYY-MM-DD
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(?:0?[1-9]|[12][0-9]|3[01]),?\s+(?:19|20)[0-9]{2}\b/gi, // Month DD, YYYY
  ],

  // Physical Addresses (US street addresses)
  ADDRESS: [
    /\b[0-9]{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Circle|Cir)\b/gi,
  ],

  // Names (common first + last name patterns)
  NAME: [
    /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g, // John Doe
    /\b(?:Mr|Mrs|Ms|Dr|Prof)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/gi, // Mr. Smith, Dr. Jane Doe
  ],

  // Passport Numbers (US format)
  PASSPORT: [
    /\b[A-Z]{1,2}[0-9]{6,9}\b/g, // US: C1234567
  ],

  // Driver License (varies by state, general pattern)
  DRIVER_LICENSE: [
    /\b[A-Z]{1,2}[0-9]{5,8}\b/g, // General: A12345678
  ],
};

// Sensitivity scores for each PII type (0-100)
const SENSITIVITY_SCORES: Record<PIIType, number> = {
  CREDIT_CARD: 100,
  SSN: 100,
  PASSPORT: 90,
  DRIVER_LICENSE: 80,
  PHONE: 70,
  EMAIL: 60,
  DATE_OF_BIRTH: 70,
  ADDRESS: 80,
  IP_ADDRESS: 50,
  NAME: 40,
};

// ============================================================================
// PII Detector
// ============================================================================

export class PIIDetector {
  /**
   * Detect PII in text
   */
  detect(text: string): PIIScanResult {
    const entities: PIIEntity[] = [];

    // Run all patterns
    for (const [type, patterns] of Object.entries(PII_PATTERNS)) {
      for (const pattern of patterns) {
        // Reset regex lastIndex
        pattern.lastIndex = 0;

        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
          const value = match[0];
          const start = match.index;
          const end = start + value.length;

          // Calculate confidence
          const confidence = this.calculateConfidence(type as PIIType, value);

          entities.push({
            type: type as PIIType,
            value,
            start,
            end,
            confidence,
          });
        }
      }
    }

    // Remove duplicates (same position)
    const uniqueEntities = this.removeDuplicates(entities);

    // Calculate overall sensitivity score
    const sensitivityScore = this.calculateSensitivityScore(uniqueEntities);

    return {
      hasPII: uniqueEntities.length > 0,
      entities: uniqueEntities,
      sensitivityScore,
    };
  }

  /**
   * Calculate confidence score for detected PII
   */
  private calculateConfidence(type: PIIType, value: string): number {
    // Higher confidence for more specific patterns
    switch (type) {
      case "CREDIT_CARD":
        return this.validateCreditCard(value) ? 0.95 : 0.7;

      case "SSN":
        return value.includes("-") ? 0.9 : 0.6; // With dashes = higher confidence

      case "EMAIL":
        return 0.95; // Email regex is very specific

      case "PHONE":
        return value.includes("+") || value.includes("(") ? 0.9 : 0.7;

      case "IP_ADDRESS":
        return this.validateIPv4(value) ? 0.95 : 0.8;

      case "NAME":
        return 0.5; // Names have many false positives

      default:
        return 0.8;
    }
  }

  /**
   * Validate credit card using Luhn algorithm
   */
  private validateCreditCard(cardNumber: string): boolean {
    const digits = cardNumber.replace(/\D/g, "");

    if (digits.length < 13 || digits.length > 19) {
      return false;
    }

    let sum = 0;
    let isEven = false;

    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits[i], 10);

      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 === 0;
  }

  /**
   * Validate IPv4 address
   */
  private validateIPv4(ip: string): boolean {
    const parts = ip.split(".");

    if (parts.length !== 4) {
      return false;
    }

    for (const part of parts) {
      const num = parseInt(part, 10);
      if (isNaN(num) || num < 0 || num > 255) {
        return false;
      }
    }

    return true;
  }

  /**
   * Remove duplicate entities (same position)
   */
  private removeDuplicates(entities: PIIEntity[]): PIIEntity[] {
    const seen = new Set<string>();
    const unique: PIIEntity[] = [];

    for (const entity of entities) {
      const key = `${entity.start}-${entity.end}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(entity);
      }
    }

    return unique;
  }

  /**
   * Calculate overall sensitivity score
   */
  private calculateSensitivityScore(entities: PIIEntity[]): number {
    if (entities.length === 0) {
      return 0;
    }

    // Take max sensitivity score
    let maxScore = 0;
    for (const entity of entities) {
      const score = SENSITIVITY_SCORES[entity.type] * entity.confidence;
      if (score > maxScore) {
        maxScore = score;
      }
    }

    return Math.min(100, Math.round(maxScore));
  }

  /**
   * Check if text contains specific PII type
   */
  containsPIIType(text: string, type: PIIType): boolean {
    const result = this.detect(text);
    return result.entities.some((e) => e.type === type);
  }

  /**
   * Get PII types present in text
   */
  getPIITypes(text: string): PIIType[] {
    const result = this.detect(text);
    const types = new Set(result.entities.map((e) => e.type));
    return Array.from(types);
  }
}

// ============================================================================
// Singleton
// ============================================================================

let defaultDetector: PIIDetector | null = null;

export function getDefaultDetector(): PIIDetector {
  if (!defaultDetector) {
    defaultDetector = new PIIDetector();
  }
  return defaultDetector;
}
