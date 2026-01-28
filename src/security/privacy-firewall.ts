/**
 * Privacy Firewall - Scan and redact PII before sending to cloud API
 *
 * Workflow:
 * 1. User sends message
 * 2. Privacy firewall scans for PII
 * 3. If found:
 *    a. Auto-redact (if enabled), OR
 *    b. Prompt user for confirmation
 * 4. Send redacted/approved message to API
 * 5. Un-redact response (restore original PII locally)
 *
 * @see Phase 9 - Pentagon+++ Security
 */

import { PIIDetector, type PIIEntity, type PIIScanResult } from "./pii-detection.js";
import { log } from "../common/log.js";

// ============================================================================
// Types
// ============================================================================

export type PrivacyConfig = {
  enabled: boolean;
  autoRedact: boolean; // Auto-redact without asking
  allowedProviders: string[]; // Providers that are trusted (e.g., self-hosted)
  sensitivityThreshold: number; // 0-100, only warn if score above this
  logPII: boolean; // Log detected PII (for debugging only!)
};

export type RedactionResult = {
  originalText: string;
  redactedText: string;
  hadPII: boolean;
  entities: PIIEntity[];
  redactionMap: Map<string, string>; // placeholder -> original
};

export type ApprovalRequest = {
  message: string;
  entities: PIIEntity[];
  provider: string;
  sensitivityScore: number;
};

// ============================================================================
// Privacy Firewall
// ============================================================================

export class PrivacyFirewall {
  private detector: PIIDetector;
  private config: PrivacyConfig;

  constructor(config: PrivacyConfig) {
    this.detector = new PIIDetector();
    this.config = config;
  }

  /**
   * Scan message for PII
   */
  async scan(message: string): Promise<PIIScanResult> {
    if (!this.config.enabled) {
      return {
        hasPII: false,
        entities: [],
        sensitivityScore: 0,
      };
    }

    const result = this.detector.detect(message);

    if (this.config.logPII && result.hasPII) {
      log.warn("PII detected in message", {
        count: result.entities.length,
        types: [...new Set(result.entities.map((e) => e.type))],
        sensitivityScore: result.sensitivityScore,
      });
    }

    return result;
  }

  /**
   * Redact PII from message
   */
  redact(message: string, entities: PIIEntity[]): RedactionResult {
    if (entities.length === 0) {
      return {
        originalText: message,
        redactedText: message,
        hadPII: false,
        entities: [],
        redactionMap: new Map(),
      };
    }

    // Sort entities by position (reverse order to preserve indices)
    const sorted = [...entities].sort((a, b) => b.start - a.start);

    let redacted = message;
    const redactionMap = new Map<string, string>();

    for (let i = 0; i < sorted.length; i++) {
      const entity = sorted[i];
      const placeholder = this.getPlaceholder(entity.type, i);

      // Store mapping
      redactionMap.set(placeholder, entity.value);

      // Replace in text
      redacted = redacted.slice(0, entity.start) + placeholder + redacted.slice(entity.end);
    }

    return {
      originalText: message,
      redactedText: redacted,
      hadPII: true,
      entities,
      redactionMap,
    };
  }

  /**
   * Get placeholder for PII type
   */
  private getPlaceholder(type: string, index: number): string {
    return `[${type}_${index}]`;
  }

  /**
   * Restore PII in response (un-redact)
   */
  restore(text: string, redactionMap: Map<string, string>): string {
    let restored = text;

    for (const [placeholder, original] of redactionMap.entries()) {
      restored = restored.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), original);
    }

    return restored;
  }

  /**
   * Process message before sending to API
   */
  async processOutgoing(message: string, provider: string): Promise<RedactionResult> {
    // Check if provider is trusted (skip for self-hosted)
    if (this.config.allowedProviders.includes(provider)) {
      log.debug("Skipping PII scan for trusted provider", { provider });
      return {
        originalText: message,
        redactedText: message,
        hadPII: false,
        entities: [],
        redactionMap: new Map(),
      };
    }

    // Scan for PII
    const scanResult = await this.scan(message);

    if (!scanResult.hasPII) {
      // No PII found, send as-is
      return {
        originalText: message,
        redactedText: message,
        hadPII: false,
        entities: [],
        redactionMap: new Map(),
      };
    }

    // Check sensitivity threshold
    if (scanResult.sensitivityScore < this.config.sensitivityThreshold) {
      log.debug("PII sensitivity below threshold, allowing", {
        score: scanResult.sensitivityScore,
        threshold: this.config.sensitivityThreshold,
      });
      return {
        originalText: message,
        redactedText: message,
        hadPII: true,
        entities: scanResult.entities,
        redactionMap: new Map(),
      };
    }

    // PII found and above threshold
    if (this.config.autoRedact) {
      // Auto-redact
      log.info("Auto-redacting PII", {
        count: scanResult.entities.length,
        score: scanResult.sensitivityScore,
      });

      return this.redact(message, scanResult.entities);
    } else {
      // Require user approval (handled by caller)
      return {
        originalText: message,
        redactedText: message,
        hadPII: true,
        entities: scanResult.entities,
        redactionMap: new Map(),
      };
    }
  }

  /**
   * Process API response (restore redacted PII)
   */
  processIncoming(response: string, redactionMap: Map<string, string>): string {
    if (redactionMap.size === 0) {
      return response;
    }

    return this.restore(response, redactionMap);
  }

  /**
   * Format approval request message for user
   */
  formatApprovalRequest(request: ApprovalRequest): string {
    const { message, entities, provider, sensitivityScore } = request;

    let output = "⚠️  PERSONALLY IDENTIFIABLE INFORMATION DETECTED\n\n";
    output += `Your message contains sensitive information that will be sent to ${provider}.\n\n`;
    output += `Detected (${entities.length} item${entities.length > 1 ? "s" : ""}):\n`;

    // Group by type
    const byType = new Map<string, PIIEntity[]>();
    for (const entity of entities) {
      if (!byType.has(entity.type)) {
        byType.set(entity.type, []);
      }
      byType.get(entity.type)!.push(entity);
    }

    for (const [type, items] of byType.entries()) {
      output += `  • ${type}: ${items.length} instance${items.length > 1 ? "s" : ""}\n`;
      for (const item of items.slice(0, 3)) {
        // Show first 3
        output += `    - ${this.maskValue(item.value, type)}\n`;
      }
      if (items.length > 3) {
        output += `    ... and ${items.length - 3} more\n`;
      }
    }

    output += `\nSensitivity Score: ${sensitivityScore}/100 ${this.getSensitivityEmoji(sensitivityScore)}\n\n`;
    output += `Options:\n`;
    output += `  1. Redact automatically (send [${entities[0].type}] placeholders)\n`;
    output += `  2. Send as-is (share PII with ${provider})\n`;
    output += `  3. Cancel\n`;

    return output;
  }

  /**
   * Mask value for display
   */
  private maskValue(value: string, type: string): string {
    if (value.length <= 4) {
      return "*".repeat(value.length);
    }

    // Show first + last 2 chars
    return value.slice(0, 2) + "*".repeat(value.length - 4) + value.slice(-2);
  }

  /**
   * Get emoji for sensitivity score
   */
  private getSensitivityEmoji(score: number): string {
    if (score >= 90) return "🔴";
    if (score >= 70) return "🟠";
    if (score >= 50) return "🟡";
    return "🟢";
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PrivacyConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): PrivacyConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_PRIVACY_CONFIG: PrivacyConfig = {
  enabled: true,
  autoRedact: false, // Ask user by default
  allowedProviders: ["self-hosted", "local"],
  sensitivityThreshold: 50, // Warn for medium+ sensitivity
  logPII: false, // NEVER log PII in production!
};

// ============================================================================
// Singleton
// ============================================================================

let defaultFirewall: PrivacyFirewall | null = null;

export function getDefaultPrivacyFirewall(): PrivacyFirewall {
  if (!defaultFirewall) {
    defaultFirewall = new PrivacyFirewall(DEFAULT_PRIVACY_CONFIG);
  }
  return defaultFirewall;
}

export function clearDefaultPrivacyFirewall(): void {
  defaultFirewall = null;
}
