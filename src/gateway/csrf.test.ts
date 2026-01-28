/**
 * Tests for CSRF protection
 */

import { describe, it, expect, beforeEach } from "vitest";
import { CSRFManager } from "./csrf.js";

describe("CSRFManager", () => {
  let manager: CSRFManager;

  beforeEach(() => {
    manager = new CSRFManager();
  });

  describe("generateToken", () => {
    it("should generate CSRF token", () => {
      const sessionId = "session-123";
      const token = manager.generateToken(sessionId);

      expect(token).toBeTruthy();
      expect(token).toHaveLength(64); // 32 bytes = 64 hex chars
    });

    it("should generate unique tokens", () => {
      const token1 = manager.generateToken("session-1");
      const token2 = manager.generateToken("session-2");

      expect(token1).not.toBe(token2);
    });

    it("should store token in session", () => {
      const sessionId = "session-123";
      const token = manager.generateToken(sessionId);

      const storedToken = manager.getToken(sessionId);
      expect(storedToken).toBe(token);
    });
  });

  describe("validateToken", () => {
    it("should validate correct token", () => {
      const sessionId = "session-123";
      const token = manager.generateToken(sessionId);

      const valid = manager.validateToken(sessionId, token);

      expect(valid).toBe(true);
    });

    it("should reject incorrect token", () => {
      const sessionId = "session-123";
      manager.generateToken(sessionId);

      const valid = manager.validateToken(sessionId, "wrong-token");

      expect(valid).toBe(false);
    });

    it("should reject missing session", () => {
      const valid = manager.validateToken("unknown-session", "any-token");

      expect(valid).toBe(false);
    });

    it("should reject expired token", () => {
      const sessionId = "session-123";
      const token = manager.generateToken(sessionId);

      // Mock token creation time to be old
      const session = manager["sessions"].get(sessionId)!;
      session.created = Date.now() - 3600001; // Just over 1 hour ago

      const valid = manager.validateToken(sessionId, token);

      expect(valid).toBe(false);
    });
  });

  describe("getToken", () => {
    it("should get token for session", () => {
      const sessionId = "session-123";
      const token = manager.generateToken(sessionId);

      const retrieved = manager.getToken(sessionId);

      expect(retrieved).toBe(token);
    });

    it("should return undefined for unknown session", () => {
      const retrieved = manager.getToken("unknown");

      expect(retrieved).toBeUndefined();
    });
  });

  describe("deleteToken", () => {
    it("should delete token", () => {
      const sessionId = "session-123";
      manager.generateToken(sessionId);

      manager.deleteToken(sessionId);

      expect(manager.getToken(sessionId)).toBeUndefined();
    });

    it("should handle deleting non-existent token", () => {
      expect(() => manager.deleteToken("unknown")).not.toThrow();
    });
  });

  describe("cleanup", () => {
    it("should remove expired tokens", () => {
      const sessionId1 = "session-1";
      const sessionId2 = "session-2";

      manager.generateToken(sessionId1);
      manager.generateToken(sessionId2);

      // Make session1 expired
      const session1 = manager["sessions"].get(sessionId1)!;
      session1.created = Date.now() - 3600001;

      manager.cleanup();

      expect(manager.getToken(sessionId1)).toBeUndefined();
      expect(manager.getToken(sessionId2)).toBeDefined();
    });

    it("should keep valid tokens", () => {
      const sessionId = "session-123";
      const token = manager.generateToken(sessionId);

      manager.cleanup();

      expect(manager.getToken(sessionId)).toBe(token);
    });
  });
});
