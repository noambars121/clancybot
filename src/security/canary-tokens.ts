/**
 * Canary Tokens - Honeypot detection system
 *
 * Plants fake sensitive data (API keys, URLs, credentials) in memory files.
 * If an attacker steals and uses this data, we get immediate alerts.
 *
 * Concept: "Honey" that alerts when touched externally
 *
 * @see Phase 9 - Pentagon+++ Security
 */

import { randomBytes, createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getChildLogger } from "../logging.js";
import type { MoltbotConfig } from "../config/types.js";

const log = getChildLogger({ module: "canary-tokens" });

// ============================================================================
// Types
// ============================================================================

export type CanaryType = "api_key" | "url" | "credential" | "token" | "webhook";

export type CanaryToken = {
  id: string;
  type: CanaryType;
  value: string;
  created: number;
  triggerUrl: string;
  description: string;
  accessed: CanaryAccess[];
};

export type CanaryAccess = {
  timestamp: number;
  ip: string;
  userAgent?: string;
  location?: string;
  method?: string;
};

export type CanaryAlert = {
  canaryId: string;
  type: CanaryType;
  triggeredAt: number;
  source: string;
  severity: "critical" | "high";
  message: string;
  recommendation: string;
};

export type CanaryConfig = {
  enabled: boolean;
  serviceUrl: string; // Canary monitoring service
  checkIntervalMs: number; // How often to check for triggers
  autoInject: boolean; // Auto-inject into memory files
  alertEmail?: string; // Optional email for alerts
};

// ============================================================================
// Canary Token Manager
// ============================================================================

export class CanaryTokenManager {
  private tokens: Map<string, CanaryToken> = new Map();
  private config: CanaryConfig;
  private checkInterval?: NodeJS.Timeout;

  constructor(config: CanaryConfig) {
    this.config = config;
  }

  /**
   * Generate a canary token
   */
  generateCanary(type: CanaryType, description?: string): CanaryToken {
    const id = randomBytes(8).toString("hex");
    const value = this.generateFakeValue(type, id);

    const token: CanaryToken = {
      id,
      type,
      value,
      created: Date.now(),
      triggerUrl: `${this.config.serviceUrl}/alert/${id}`,
      description: description || this.getDefaultDescription(type),
      accessed: [],
    };

    this.tokens.set(id, token);
    log.debug("Generated canary token", { id, type });

    return token;
  }

  /**
   * Generate fake but realistic-looking value
   */
  private generateFakeValue(type: CanaryType, id: string): string {
    switch (type) {
      case "api_key":
        // Looks like OpenAI/Anthropic key
        return `sk-canary-${randomBytes(24).toString("hex")}`;

      case "token":
        // Looks like JWT or session token
        return `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.${randomBytes(32).toString("base64url")}.${randomBytes(32).toString("base64url")}`;

      case "credential":
        // Looks like username:password
        return `legacy_user:canary_${randomBytes(8).toString("hex")}`;

      case "webhook":
        // Webhook URL that triggers alert
        return `${this.config.serviceUrl}/webhook/${id}`;

      case "url":
        // Generic URL
        return `${this.config.serviceUrl}/api/${id}/data`;

      default:
        return randomBytes(16).toString("hex");
    }
  }

  /**
   * Get default description for canary type
   */
  private getDefaultDescription(type: CanaryType): string {
    const descriptions: Record<CanaryType, string> = {
      api_key: "Legacy API key (deprecated, do not use)",
      url: "Backup webhook URL (for reference only)",
      credential: "Old service credentials (archived)",
      token: "Session token from previous deployment",
      webhook: "Legacy notification webhook",
    };
    return descriptions[type];
  }

  /**
   * Inject canaries into memory/config content
   */
  injectCanaries(content: string): string {
    if (!this.config.autoInject) {
      return content;
    }

    // Generate 3 canaries of different types
    const apiKeyCanary = this.generateCanary("api_key");
    const webhookCanary = this.generateCanary("webhook");
    const credentialCanary = this.generateCanary("credential");

    // Inject as realistic-looking "legacy" data
    const injection = `

## 📝 Legacy Configuration (Archive)

> **Note:** The following keys are from previous deployments and are no longer active.
> They are kept here for reference only. Do not use in production.

### API Keys (Deprecated)
- \`OPENAI_LEGACY_KEY\`: ${apiKeyCanary.value}
- \`ANTHROPIC_BACKUP_KEY\`: ${this.generateFakeValue("api_key", "backup")}

### Webhooks (Archive)
- \`LEGACY_WEBHOOK\`: ${webhookCanary.value}
- \`BACKUP_NOTIFICATION_URL\`: ${this.generateFakeValue("url", "notif")}

### Service Credentials (Old)
- \`LEGACY_SERVICE_AUTH\`: ${credentialCanary.value}

---
*Last updated: ${new Date().toISOString().split("T")[0]}*
`;

    return content + injection;
  }

  /**
   * Inject canaries into memory file
   */
  async injectIntoFile(filePath: string): Promise<void> {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = await readFile(filePath, "utf8");

    // Check if already injected
    if (content.includes("Legacy Configuration (Archive)")) {
      log.debug("Canaries already injected", { file: filePath });
      return;
    }

    const injected = this.injectCanaries(content);
    await writeFile(filePath, injected, "utf8");

    log.info("Injected canary tokens into file", {
      file: filePath,
      count: this.tokens.size,
    });
  }

  /**
   * Check if any canaries were triggered
   */
  async checkCanaries(): Promise<CanaryAlert[]> {
    if (!this.config.enabled) {
      return [];
    }

    const alerts: CanaryAlert[] = [];

    for (const [id, canary] of this.tokens.entries()) {
      try {
        // Call canary service to check status
        const response = await fetch(`${this.config.serviceUrl}/status/${id}`, {
          headers: { "User-Agent": "Moltbot-Canary/1.0" },
        });

        if (!response.ok) {
          continue;
        }

        const data = (await response.json()) as {
          triggered: boolean;
          accesses: CanaryAccess[];
        };

        if (data.triggered && data.accesses.length > 0) {
          // New access detected!
          const newAccesses = data.accesses.filter(
            (access) =>
              !canary.accessed.some((existing) => existing.timestamp === access.timestamp)
          );

          if (newAccesses.length > 0) {
            // Update token
            canary.accessed.push(...newAccesses);

            // Create alert
            const latestAccess = newAccesses[newAccesses.length - 1];
            alerts.push({
              canaryId: id,
              type: canary.type,
              triggeredAt: latestAccess.timestamp,
              source: latestAccess.ip,
              severity: "critical",
              message: `🚨 SECURITY BREACH DETECTED!\n\nCanary token was accessed externally:\n  Type: ${canary.type}\n  Description: ${canary.description}\n  Source IP: ${latestAccess.ip}\n  Time: ${new Date(latestAccess.timestamp).toISOString()}\n  User-Agent: ${latestAccess.userAgent || "Unknown"}\n\nThis indicates that your memory files may have been stolen!`,
              recommendation:
                "IMMEDIATE ACTION REQUIRED:\n" +
                "1. Rotate ALL credentials immediately\n" +
                "2. Review system for malware/infostealers\n" +
                "3. Change memory encryption passphrase\n" +
                "4. Run 'clancybot doctor' for security audit\n" +
                "5. Check recent file access logs\n" +
                "6. Consider isolating the machine",
            });

            log.error("🚨 Canary token triggered!", {
              id,
              type: canary.type,
              source: latestAccess.ip,
            });
          }
        }
      } catch (err) {
        log.warn("Failed to check canary status", { id, error: err });
      }
    }

    return alerts;
  }

  /**
   * Start continuous monitoring
   */
  startMonitoring(): void {
    if (this.checkInterval) {
      log.warn("Canary monitoring already running");
      return;
    }

    log.info("Starting canary token monitoring", {
      interval: this.config.checkIntervalMs,
      tokens: this.tokens.size,
    });

    this.checkInterval = setInterval(async () => {
      const alerts = await this.checkCanaries();

      if (alerts.length > 0) {
        for (const alert of alerts) {
          await this.handleAlert(alert);
        }
      }
    }, this.config.checkIntervalMs) as unknown as NodeJS.Timeout;
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
      log.info("Stopped canary monitoring");
    }
  }

  /**
   * Handle canary alert
   */
  private async handleAlert(alert: CanaryAlert): Promise<void> {
    // Log to security events
    log.error(alert.message);
    log.error(alert.recommendation);

    // TODO: Send email alert if configured
    if (this.config.alertEmail) {
      await this.sendEmailAlert(alert);
    }

    // TODO: Integrate with security dashboard
    // TODO: Send push notification to mobile app
  }

  /**
   * Send email alert (placeholder)
   */
  private async sendEmailAlert(alert: CanaryAlert): Promise<void> {
    log.info("Email alert would be sent", {
      to: this.config.alertEmail,
      subject: "🚨 Moltbot Security Breach Detected",
    });
    // TODO: Implement email sending
  }

  /**
   * Get all canary tokens
   */
  getTokens(): CanaryToken[] {
    return Array.from(this.tokens.values());
  }

  /**
   * Get canary by ID
   */
  getToken(id: string): CanaryToken | undefined {
    return this.tokens.get(id);
  }

  /**
   * Remove canary token
   */
  removeToken(id: string): boolean {
    return this.tokens.delete(id);
  }

  /**
   * Clear all canary tokens
   */
  clear(): void {
    this.tokens.clear();
  }

  /**
   * Save canaries to disk
   */
  async save(path: string): Promise<void> {
    const data = {
      version: "1.0",
      created: Date.now(),
      tokens: Array.from(this.tokens.values()),
    };

    await writeFile(path, JSON.stringify(data, null, 2), "utf8");
    log.debug("Saved canary tokens", { path, count: this.tokens.size });
  }

  /**
   * Load canaries from disk
   */
  async load(path: string): Promise<void> {
    if (!existsSync(path)) {
      log.debug("No canary tokens file found", { path });
      return;
    }

    const content = await readFile(path, "utf8");
    const data = JSON.parse(content) as { tokens: CanaryToken[] };

    this.tokens.clear();
    for (const token of data.tokens) {
      this.tokens.set(token.id, token);
    }

    log.info("Loaded canary tokens", { path, count: this.tokens.size });
  }
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_CANARY_CONFIG: CanaryConfig = {
  enabled: false, // Disabled by default (requires setup)
  serviceUrl: "http://localhost:19999", // Local canary service
  checkIntervalMs: 300000, // Check every 5 minutes
  autoInject: true,
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Create canary manager from Moltbot config
 */
export function createCanaryManager(config: MoltbotConfig): CanaryTokenManager {
  const canaryConfig: CanaryConfig = {
    ...DEFAULT_CANARY_CONFIG,
    ...((config as any).security?.canary as Partial<CanaryConfig> | undefined),
  };

  return new CanaryTokenManager(canaryConfig);
}

/**
 * Generate a single canary for quick use
 */
export function generateQuickCanary(type: CanaryType = "api_key"): string {
  const manager = new CanaryTokenManager(DEFAULT_CANARY_CONFIG);
  const canary = manager.generateCanary(type);
  return canary.value;
}
