import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { OAuthTokenManager, type OAuthToken, isOAuthAuthError } from "./oauth-manager.js";

describe("oauth-manager", () => {
  let manager: OAuthTokenManager;
  
  beforeEach(() => {
    manager = new OAuthTokenManager();
  });
  
  describe("isTokenValid", () => {
    it("should return false for empty access token", () => {
      const token: OAuthToken = {
        access: "",
        provider: "test",
      };
      
      expect(manager.isTokenValid(token)).toBe(false);
    });
    
    it("should return true for valid token with no expiry", () => {
      const token: OAuthToken = {
        access: "valid-token",
        provider: "test",
      };
      
      expect(manager.isTokenValid(token)).toBe(true);
    });
    
    it("should return false for expired token", () => {
      const token: OAuthToken = {
        access: "expired-token",
        expires: Date.now() - 10000, // 10 seconds ago
        provider: "test",
      };
      
      expect(manager.isTokenValid(token)).toBe(false);
    });
    
    it("should return false for token expiring within buffer", () => {
      const token: OAuthToken = {
        access: "soon-expired",
        expires: Date.now() + 2000, // 2 seconds from now
        provider: "test",
      };
      
      const buffer = 5 * 60 * 1000; // 5 minutes
      expect(manager.isTokenValid(token, buffer)).toBe(false);
    });
    
    it("should return true for token expiring after buffer", () => {
      const token: OAuthToken = {
        access: "valid-token",
        expires: Date.now() + 10 * 60 * 1000, // 10 minutes from now
        provider: "test",
      };
      
      const buffer = 5 * 60 * 1000; // 5 minutes
      expect(manager.isTokenValid(token, buffer)).toBe(true);
    });
  });
  
  describe("getToken", () => {
    it("should not refresh valid token", async () => {
      const token: OAuthToken = {
        access: "valid-token",
        expires: Date.now() + 60 * 60 * 1000, // 1 hour from now
        provider: "test",
      };
      
      let refreshCalled = false;
      const refreshFn = async (t: OAuthToken) => {
        refreshCalled = true;
        return t;
      };
      
      const result = await manager.getToken(token, refreshFn);
      
      expect(result.refreshed).toBe(false);
      expect(refreshCalled).toBe(false);
    });
    
    it("should refresh expired token", async () => {
      const token: OAuthToken = {
        access: "old-token",
        expires: Date.now() - 1000, // Expired
        provider: "test",
      };
      
      const refreshFn = async (t: OAuthToken) => {
        return {
          ...t,
          access: "new-token",
          expires: Date.now() + 60 * 60 * 1000,
        };
      };
      
      const result = await manager.getToken(token, refreshFn);
      
      expect(result.refreshed).toBe(true);
      expect(result.token.access).toBe("new-token");
    });
    
    it("should force refresh when requested", async () => {
      const token: OAuthToken = {
        access: "valid-token",
        expires: Date.now() + 60 * 60 * 1000,
        provider: "test",
      };
      
      let refreshCalled = false;
      const refreshFn = async (t: OAuthToken) => {
        refreshCalled = true;
        return { ...t, access: "refreshed-token" };
      };
      
      const result = await manager.getToken(token, refreshFn, {
        forceRefresh: true,
      });
      
      expect(result.refreshed).toBe(true);
      expect(refreshCalled).toBe(true);
    });
  });
  
  describe("isOAuthAuthError", () => {
    it("should detect 401 status", () => {
      const error = { status: 401, message: "Unauthorized" };
      expect(isOAuthAuthError(error)).toBe(true);
    });
    
    it("should detect OAuth error messages", () => {
      const errors = [
        { message: "invalid_token" },
        { message: "Token expired" },
        { message: "Token invalid" },
        { message: "Authentication failed" },
        { message: "OAuth error" },
      ];
      
      for (const error of errors) {
        expect(isOAuthAuthError(error)).toBe(true);
      }
    });
    
    it("should not detect non-OAuth errors", () => {
      const errors = [
        { status: 500, message: "Server error" },
        { message: "Network timeout" },
        { message: "Invalid input" },
      ];
      
      for (const error of errors) {
        expect(isOAuthAuthError(error)).toBe(false);
      }
    });
  });
});
