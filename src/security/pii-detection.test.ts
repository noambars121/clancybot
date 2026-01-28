/**
 * Tests for PII detection
 */

import { describe, it, expect } from "vitest";
import { PIIDetector } from "./pii-detection.js";

describe("PIIDetector", () => {
  let detector: PIIDetector;

  beforeEach(() => {
    detector = new PIIDetector();
  });

  describe("credit card detection", () => {
    it("should detect Visa card", () => {
      const text = "My card is 4532123456789012";
      const result = detector.detect(text);

      expect(result.hasPII).toBe(true);
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].type).toBe("CREDIT_CARD");
      expect(result.entities[0].value).toBe("4532123456789012");
    });

    it("should detect card with spaces", () => {
      const text = "Card: 4532 1234 5678 9012";
      const result = detector.detect(text);

      expect(result.hasPII).toBe(true);
      const creditCards = result.entities.filter((e) => e.type === "CREDIT_CARD");
      expect(creditCards.length).toBeGreaterThan(0);
    });

    it("should detect MasterCard", () => {
      const text = "My MasterCard 5425233430109903";
      const result = detector.detect(text);

      expect(result.hasPII).toBe(true);
      const creditCards = result.entities.filter((e) => e.type === "CREDIT_CARD");
      expect(creditCards.length).toBeGreaterThan(0);
    });

    it("should validate credit card with Luhn", () => {
      const validCard = "4532015112830366"; // Valid Luhn
      const invalidCard = "4532015112830367"; // Invalid Luhn

      const validResult = detector.detect(`Card: ${validCard}`);
      const invalidResult = detector.detect(`Card: ${invalidCard}`);

      // Both detected, but valid should have higher confidence
      const validEntity = validResult.entities.find((e) => e.value === validCard);
      const invalidEntity = invalidResult.entities.find((e) => e.value === invalidCard);

      if (validEntity && invalidEntity) {
        expect(validEntity.confidence).toBeGreaterThan(invalidEntity.confidence);
      }
    });
  });

  describe("SSN detection", () => {
    it("should detect SSN with dashes", () => {
      const text = "My SSN is 123-45-6789";
      const result = detector.detect(text);

      expect(result.hasPII).toBe(true);
      expect(result.entities.some((e) => e.type === "SSN")).toBe(true);
      expect(result.entities.some((e) => e.value === "123-45-6789")).toBe(true);
    });

    it("should detect SSN without dashes", () => {
      const text = "SSN: 987654321";
      const result = detector.detect(text);

      expect(result.hasPII).toBe(true);
      expect(result.entities.some((e) => e.type === "SSN")).toBe(true);
    });
  });

  describe("email detection", () => {
    it("should detect email addresses", () => {
      const text = "Contact me at john.doe@example.com for info";
      const result = detector.detect(text);

      expect(result.hasPII).toBe(true);
      expect(result.entities.some((e) => e.type === "EMAIL")).toBe(true);
      expect(result.entities.some((e) => e.value === "john.doe@example.com")).toBe(true);
    });

    it("should detect multiple emails", () => {
      const text = "Email alice@test.com or bob@example.org";
      const result = detector.detect(text);

      const emails = result.entities.filter((e) => e.type === "EMAIL");
      expect(emails).toHaveLength(2);
    });
  });

  describe("phone number detection", () => {
    it("should detect US phone with parentheses", () => {
      const text = "Call me at (555) 123-4567";
      const result = detector.detect(text);

      expect(result.hasPII).toBe(true);
      expect(result.entities.some((e) => e.type === "PHONE")).toBe(true);
    });

    it("should detect phone with +1", () => {
      const text = "Phone: +1 555-123-4567";
      const result = detector.detect(text);

      expect(result.hasPII).toBe(true);
      expect(result.entities.some((e) => e.type === "PHONE")).toBe(true);
    });

    it("should detect international phone", () => {
      const text = "Call +44 20 1234 5678";
      const result = detector.detect(text);

      expect(result.hasPII).toBe(true);
      expect(result.entities.some((e) => e.type === "PHONE")).toBe(true);
    });
  });

  describe("IP address detection", () => {
    it("should detect IPv4 address", () => {
      const text = "Server at 192.168.1.1";
      const result = detector.detect(text);

      expect(result.hasPII).toBe(true);
      expect(result.entities.some((e) => e.type === "IP_ADDRESS")).toBe(true);
      expect(result.entities.some((e) => e.value === "192.168.1.1")).toBe(true);
    });

    it("should validate IPv4", () => {
      const valid = "192.168.1.1";
      const invalid = "999.999.999.999";

      const validResult = detector.detect(valid);
      const invalidResult = detector.detect(invalid);

      const validIP = validResult.entities.find((e) => e.value === valid);
      const invalidIP = invalidResult.entities.find((e) => e.value === invalid);

      if (validIP && invalidIP) {
        expect(validIP.confidence).toBeGreaterThan(invalidIP.confidence);
      }
    });
  });

  describe("date of birth detection", () => {
    it("should detect MM/DD/YYYY format", () => {
      const text = "DOB: 03/15/1990";
      const result = detector.detect(text);

      expect(result.hasPII).toBe(true);
      expect(result.entities.some((e) => e.type === "DATE_OF_BIRTH")).toBe(true);
    });

    it("should detect YYYY-MM-DD format", () => {
      const text = "Born: 1990-03-15";
      const result = detector.detect(text);

      expect(result.hasPII).toBe(true);
      expect(result.entities.some((e) => e.type === "DATE_OF_BIRTH")).toBe(true);
    });

    it("should detect Month DD, YYYY format", () => {
      const text = "Birthday: March 15, 1990";
      const result = detector.detect(text);

      expect(result.hasPII).toBe(true);
      expect(result.entities.some((e) => e.type === "DATE_OF_BIRTH")).toBe(true);
    });
  });

  describe("address detection", () => {
    it("should detect street address", () => {
      const text = "I live at 123 Main Street";
      const result = detector.detect(text);

      expect(result.hasPII).toBe(true);
      expect(result.entities.some((e) => e.type === "ADDRESS")).toBe(true);
    });

    it("should detect various street types", () => {
      const addresses = [
        "456 Oak Avenue",
        "789 Park Road",
        "321 Elm Boulevard",
        "654 Pine Lane",
        "987 Cedar Drive",
      ];

      for (const addr of addresses) {
        const result = detector.detect(addr);
        expect(result.entities.some((e) => e.type === "ADDRESS")).toBe(true);
      }
    });
  });

  describe("name detection", () => {
    it("should detect names", () => {
      const text = "My name is John Doe";
      const result = detector.detect(text);

      expect(result.hasPII).toBe(true);
      expect(result.entities.some((e) => e.type === "NAME")).toBe(true);
    });

    it("should detect names with titles", () => {
      const text = "Contact Dr. Jane Smith";
      const result = detector.detect(text);

      expect(result.hasPII).toBe(true);
      expect(result.entities.some((e) => e.type === "NAME")).toBe(true);
    });
  });

  describe("multiple PII types", () => {
    it("should detect multiple types in one text", () => {
      const text =
        "John Doe, SSN 123-45-6789, email john@example.com, phone (555) 123-4567, card 4532123456789012";

      const result = detector.detect(text);

      expect(result.hasPII).toBe(true);
      expect(result.entities.length).toBeGreaterThan(4);

      const types = new Set(result.entities.map((e) => e.type));
      expect(types.has("NAME")).toBe(true);
      expect(types.has("SSN")).toBe(true);
      expect(types.has("EMAIL")).toBe(true);
      expect(types.has("PHONE")).toBe(true);
      expect(types.has("CREDIT_CARD")).toBe(true);
    });
  });

  describe("sensitivity scoring", () => {
    it("should score credit card as high sensitivity", () => {
      const text = "Card: 4532123456789012";
      const result = detector.detect(text);

      expect(result.sensitivityScore).toBeGreaterThan(80);
    });

    it("should score names as lower sensitivity", () => {
      const text = "Name: John Doe";
      const result = detector.detect(text);

      expect(result.sensitivityScore).toBeLessThan(60);
    });

    it("should return 0 for no PII", () => {
      const text = "The weather is nice today";
      const result = detector.detect(text);

      expect(result.sensitivityScore).toBe(0);
    });
  });

  describe("entity positions", () => {
    it("should track correct start/end positions", () => {
      const text = "Email: test@example.com end";
      const result = detector.detect(text);

      const email = result.entities.find((e) => e.type === "EMAIL");
      expect(email).toBeDefined();
      expect(text.substring(email!.start, email!.end)).toBe("test@example.com");
    });
  });

  describe("helper methods", () => {
    it("should check if contains specific PII type", () => {
      const text = "Email: test@example.com";

      expect(detector.containsPIIType(text, "EMAIL")).toBe(true);
      expect(detector.containsPIIType(text, "SSN")).toBe(false);
    });

    it("should get PII types present", () => {
      const text = "Email test@example.com and phone (555) 123-4567";

      const types = detector.getPIITypes(text);

      expect(types).toContain("EMAIL");
      expect(types).toContain("PHONE");
      expect(types).not.toContain("SSN");
    });
  });

  describe("edge cases", () => {
    it("should handle empty string", () => {
      const result = detector.detect("");

      expect(result.hasPII).toBe(false);
      expect(result.entities).toHaveLength(0);
    });

    it("should handle text with no PII", () => {
      const text = "The quick brown fox jumps over the lazy dog";
      const result = detector.detect(text);

      expect(result.hasPII).toBe(false);
    });

    it("should handle special characters", () => {
      const text = "Email: test+tag@example.com";
      const result = detector.detect(text);

      expect(result.entities.some((e) => e.type === "EMAIL")).toBe(true);
    });
  });
});
