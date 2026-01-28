/**
 * Tests for privacy firewall
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  PrivacyFirewall,
  DEFAULT_PRIVACY_CONFIG,
  getDefaultPrivacyFirewall,
  clearDefaultPrivacyFirewall,
  type PrivacyConfig,
} from "./privacy-firewall.js";

describe("PrivacyFirewall", () => {
  let firewall: PrivacyFirewall;
  let config: PrivacyConfig;

  beforeEach(() => {
    config = {
      ...DEFAULT_PRIVACY_CONFIG,
      enabled: true,
    };
    firewall = new PrivacyFirewall(config);
  });

  describe("scan", () => {
    it("should detect PII in message", async () => {
      const message = "My email is test@example.com";
      const result = await firewall.scan(message);

      expect(result.hasPII).toBe(true);
      expect(result.entities.length).toBeGreaterThan(0);
      expect(result.entities[0].type).toBe("EMAIL");
    });

    it("should return no PII for clean message", async () => {
      const message = "Hello, how are you today?";
      const result = await firewall.scan(message);

      expect(result.hasPII).toBe(false);
      expect(result.entities).toHaveLength(0);
    });

    it("should respect enabled flag", async () => {
      const disabledFirewall = new PrivacyFirewall({
        ...config,
        enabled: false,
      });

      const message = "Email: test@example.com";
      const result = await disabledFirewall.scan(message);

      expect(result.hasPII).toBe(false); // Disabled, no scanning
    });
  });

  describe("redact", () => {
    it("should redact single PII entity", async () => {
      const message = "My email is test@example.com";
      const scanResult = await firewall.scan(message);

      const redactionResult = firewall.redact(message, scanResult.entities);

      expect(redactionResult.hadPII).toBe(true);
      expect(redactionResult.redactedText).toContain("[EMAIL_");
      expect(redactionResult.redactedText).not.toContain("test@example.com");
      expect(redactionResult.redactionMap.size).toBeGreaterThan(0);
    });

    it("should redact multiple PII entities", async () => {
      const message = "Contact me: test@example.com or phone (555) 123-4567";
      const scanResult = await firewall.scan(message);

      const redactionResult = firewall.redact(message, scanResult.entities);

      expect(redactionResult.hadPII).toBe(true);
      expect(redactionResult.redactedText).toContain("[EMAIL_");
      expect(redactionResult.redactedText).toContain("[PHONE_");
      expect(redactionResult.redactedText).not.toContain("test@example.com");
      expect(redactionResult.redactedText).not.toContain("555");
    });

    it("should handle empty entities", () => {
      const message = "Hello world";
      const result = firewall.redact(message, []);

      expect(result.hadPII).toBe(false);
      expect(result.redactedText).toBe(message);
      expect(result.redactionMap.size).toBe(0);
    });

    it("should preserve message structure", async () => {
      const message = "My SSN is 123-45-6789 and email is test@example.com";
      const scanResult = await firewall.scan(message);

      const redactionResult = firewall.redact(message, scanResult.entities);

      // Should still have "and" between redacted parts
      expect(redactionResult.redactedText).toContain("and");
      expect(redactionResult.redactedText).toContain("My");
    });
  });

  describe("restore", () => {
    it("should restore redacted PII", async () => {
      const original = "Email: test@example.com";
      const scanResult = await firewall.scan(original);
      const redactionResult = firewall.redact(original, scanResult.entities);

      const restored = firewall.restore(redactionResult.redactedText, redactionResult.redactionMap);

      expect(restored).toBe(original);
    });

    it("should handle multiple placeholders", async () => {
      const original = "Email test@example.com and SSN 123-45-6789";
      const scanResult = await firewall.scan(original);
      const redactionResult = firewall.redact(original, scanResult.entities);

      const restored = firewall.restore(redactionResult.redactedText, redactionResult.redactionMap);

      expect(restored).toBe(original);
    });

    it("should handle empty redaction map", () => {
      const text = "No redactions here";
      const restored = firewall.restore(text, new Map());

      expect(restored).toBe(text);
    });
  });

  describe("processOutgoing", () => {
    it("should skip scan for trusted providers", async () => {
      const message = "Email: test@example.com";
      const result = await firewall.processOutgoing(message, "self-hosted");

      expect(result.hadPII).toBe(false); // Skipped scan
      expect(result.redactedText).toBe(message);
    });

    it("should scan for untrusted providers", async () => {
      const message = "Email: test@example.com";
      const result = await firewall.processOutgoing(message, "anthropic");

      expect(result.hadPII).toBe(true);
    });

    it("should auto-redact when enabled", async () => {
      const autoRedactFirewall = new PrivacyFirewall({
        ...config,
        autoRedact: true,
      });

      const message = "SSN: 123-45-6789";
      const result = await autoRedactFirewall.processOutgoing(message, "anthropic");

      expect(result.hadPII).toBe(true);
      expect(result.redactedText).not.toContain("123-45-6789");
      expect(result.redactedText).toContain("[SSN_");
    });

    it("should respect sensitivity threshold", async () => {
      const highThresholdFirewall = new PrivacyFirewall({
        ...config,
        sensitivityThreshold: 90, // Very high threshold
      });

      const message = "Name: John Doe"; // Low sensitivity
      const result = await highThresholdFirewall.processOutgoing(message, "anthropic");

      // Below threshold, should not redact
      expect(result.redactedText).toBe(message);
    });

    it("should redact high sensitivity PII above threshold", async () => {
      const firewall = new PrivacyFirewall({
        ...config,
        autoRedact: true,
        sensitivityThreshold: 50,
      });

      const message = "Card: 4532123456789012"; // High sensitivity (100)
      const result = await firewall.processOutgoing(message, "anthropic");

      expect(result.hadPII).toBe(true);
      expect(result.redactedText).not.toContain("4532123456789012");
    });
  });

  describe("processIncoming", () => {
    it("should restore PII in response", () => {
      const redactionMap = new Map([
        ["[EMAIL_0]", "test@example.com"],
        ["[PHONE_1]", "(555) 123-4567"],
      ]);

      const response = "You can reach them at [EMAIL_0] or [PHONE_1]";
      const restored = firewall.processIncoming(response, redactionMap);

      expect(restored).toContain("test@example.com");
      expect(restored).toContain("(555) 123-4567");
      expect(restored).not.toContain("[EMAIL_0]");
    });

    it("should handle no redactions", () => {
      const response = "Here is your answer";
      const restored = firewall.processIncoming(response, new Map());

      expect(restored).toBe(response);
    });
  });

  describe("formatApprovalRequest", () => {
    it("should format approval request with PII details", async () => {
      const message = "Email: test@example.com, Phone: (555) 123-4567";
      const scanResult = await firewall.scan(message);

      const request = {
        message,
        entities: scanResult.entities,
        provider: "anthropic",
        sensitivityScore: scanResult.sensitivityScore,
      };

      const formatted = firewall.formatApprovalRequest(request);

      expect(formatted).toContain("PERSONALLY IDENTIFIABLE INFORMATION");
      expect(formatted).toContain("anthropic");
      expect(formatted).toContain("Detected");
      expect(formatted).toContain("Sensitivity Score");
    });

    it("should group entities by type", async () => {
      const message = "Email: test1@example.com, also test2@example.com";
      const scanResult = await firewall.scan(message);

      const request = {
        message,
        entities: scanResult.entities,
        provider: "openai",
        sensitivityScore: scanResult.sensitivityScore,
      };

      const formatted = firewall.formatApprovalRequest(request);

      expect(formatted).toContain("EMAIL");
    });

    it("should mask sensitive values", async () => {
      const message = "SSN: 123-45-6789";
      const scanResult = await firewall.scan(message);

      const request = {
        message,
        entities: scanResult.entities,
        provider: "anthropic",
        sensitivityScore: scanResult.sensitivityScore,
      };

      const formatted = firewall.formatApprovalRequest(request);

      // Should NOT show full SSN in approval request
      expect(formatted).not.toContain("123-45-6789");
      expect(formatted).toMatch(/\*+/); // Should have asterisks
    });
  });

  describe("config management", () => {
    it("should update configuration", () => {
      firewall.updateConfig({ autoRedact: true });

      const newConfig = firewall.getConfig();
      expect(newConfig.autoRedact).toBe(true);
    });

    it("should get current configuration", () => {
      const currentConfig = firewall.getConfig();

      expect(currentConfig.enabled).toBe(config.enabled);
      expect(currentConfig.autoRedact).toBe(config.autoRedact);
    });

    it("should preserve other config values when updating", () => {
      const original = firewall.getConfig();

      firewall.updateConfig({ autoRedact: !original.autoRedact });

      const updated = firewall.getConfig();
      expect(updated.enabled).toBe(original.enabled);
      expect(updated.sensitivityThreshold).toBe(original.sensitivityThreshold);
    });
  });
});

describe("singleton", () => {
  afterEach(() => {
    clearDefaultPrivacyFirewall();
  });

  it("should return same instance", () => {
    const firewall1 = getDefaultPrivacyFirewall();
    const firewall2 = getDefaultPrivacyFirewall();

    expect(firewall1).toBe(firewall2);
  });

  it("should clear singleton", () => {
    const firewall1 = getDefaultPrivacyFirewall();
    clearDefaultPrivacyFirewall();
    const firewall2 = getDefaultPrivacyFirewall();

    expect(firewall1).not.toBe(firewall2);
  });
});
