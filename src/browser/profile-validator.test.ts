import { describe, expect, it } from "vitest";
import {
  isBlockedProfileName,
  validateBrowserProfile,
  type BrowserProfileValidationResult,
} from "./profile-validator.js";

describe("Browser Profile Validator", () => {
  describe("isBlockedProfileName", () => {
    it("should block default profile names", () => {
      expect(isBlockedProfileName("default")).toBe(true);
      expect(isBlockedProfileName("Default")).toBe(true);
      expect(isBlockedProfileName("DEFAULT")).toBe(true);
    });

    it("should block Profile 1", () => {
      expect(isBlockedProfileName("Profile 1")).toBe(true);
      expect(isBlockedProfileName("profile 1")).toBe(true);
      expect(isBlockedProfileName("PROFILE 1")).toBe(true);
    });

    it("should block common system profiles", () => {
      expect(isBlockedProfileName("Person 1")).toBe(true);
      expect(isBlockedProfileName("user")).toBe(true);
      expect(isBlockedProfileName("User")).toBe(true);
      expect(isBlockedProfileName("main")).toBe(true);
      expect(isBlockedProfileName("Main")).toBe(true);
    });

    it("should allow custom profile names", () => {
      expect(isBlockedProfileName("moltbot")).toBe(false);
      expect(isBlockedProfileName("Moltbot Bot")).toBe(false);
      expect(isBlockedProfileName("Bot Profile")).toBe(false);
      expect(isBlockedProfileName("Work Bot")).toBe(false);
    });

    it("should handle whitespace", () => {
      expect(isBlockedProfileName("  default  ")).toBe(true);
      expect(isBlockedProfileName(" Profile 1 ")).toBe(true);
    });
  });

  describe("validateBrowserProfile", () => {
    it("should reject default profile", () => {
      const result = validateBrowserProfile("default");
      
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("default browser profile");
      expect(result.reason).toContain("Create a dedicated profile");
    });

    it("should reject Default profile", () => {
      const result = validateBrowserProfile("Default");
      
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("default browser profile");
    });

    it("should reject Profile 1", () => {
      const result = validateBrowserProfile("Profile 1");
      
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("default browser profile");
    });

    it("should accept custom profile names", () => {
      const result = validateBrowserProfile("moltbot");
      
      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("should accept Moltbot Bot profile", () => {
      const result = validateBrowserProfile("Moltbot Bot");
      
      expect(result.valid).toBe(true);
    });

    it("should provide helpful error message", () => {
      const result = validateBrowserProfile("default");
      
      expect(result.reason).toContain("chrome://settings/manageProfile");
      expect(result.reason).toContain("about:profiles");
    });
  });
});
