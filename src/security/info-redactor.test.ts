import { describe, it, expect } from "vitest";
import {
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
} from "./info-redactor.js";

describe("InfoRedactor", () => {
  describe("redactTokens", () => {
    it("redacts OpenAI/Anthropic API keys", () => {
      const text = "Your API key is sk-ant-FAKE-TEST-KEY-NOT-REAL";
      const redacted = redactTokens(text);
      expect(redacted).not.toContain("sk-ant");
      expect(redacted).toContain("[REDACTED_TOKEN]");
    });

    it("redacts GitHub tokens", () => {
      const text = "GitHub PAT: ghp-FAKE-TEST-TOKEN-NOT-REAL";
      const redacted = redactTokens(text);
      expect(redacted).not.toContain("ghp_");
      expect(redacted).toContain("[REDACTED_TOKEN]");
    });

    it("redacts AWS keys", () => {
      const text = "AWS_ACCESS_KEY_ID=AKIA-FAKE-TEST-KEY";
      const redacted = redactTokens(text);
      expect(redacted).not.toContain("AKIA");
      expect(redacted).toContain("[REDACTED_TOKEN]");
    });

    it("redacts Slack tokens", () => {
      const text = "Slack token: xoxb-FAKE-TOKEN-FOR-TESTING-ONLY-NOT-REAL";
      const redacted = redactTokens(text);
      expect(redacted).not.toContain("xoxb-");
      expect(redacted).toContain("[REDACTED_TOKEN]");
    });

    it("redacts JWT tokens", () => {
      const text = "Authorization: Bearer FAKE-JWT-TOKEN.FOR-TESTING.ONLY";
      const redacted = redactTokens(text);
      expect(redacted).not.toContain("eyJhbGciOi");
      expect(redacted).toContain("[REDACTED_TOKEN]");
    });

    it("redacts private keys", () => {
      const text = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA1234567890
-----END RSA PRIVATE KEY-----`;
      const redacted = redactTokens(text);
      expect(redacted).not.toContain("BEGIN RSA PRIVATE KEY");
      expect(redacted).toContain("[REDACTED_TOKEN]");
    });

    it("preserves non-token text", () => {
      const text = "This is a normal message without tokens";
      const redacted = redactTokens(text);
      expect(redacted).toBe(text);
    });
  });

  describe("redactPasswords", () => {
    it("redacts password values", () => {
      const text = 'password="SuperSecret123"';
      const redacted = redactPasswords(text);
      expect(redacted).toContain("password=");
      expect(redacted).not.toContain("SuperSecret123");
      expect(redacted).toContain("[REDACTED_SECRET]");
    });

    it("redacts API keys", () => {
      const text = "api_key: abc123xyz";
      const redacted = redactPasswords(text);
      expect(redacted).toContain("api_key");
      expect(redacted).not.toContain("abc123xyz");
    });

    it("redacts secrets", () => {
      const text = 'secret="MySecretValue"';
      const redacted = redactPasswords(text);
      expect(redacted).toContain("secret=");
      expect(redacted).not.toContain("MySecretValue");
    });

    it("redacts tokens", () => {
      const text = "token: abcd1234";
      const redacted = redactPasswords(text);
      expect(redacted).toContain("token");
      expect(redacted).not.toContain("abcd1234");
    });
  });

  describe("redactPaths", () => {
    it("redacts Linux home directories", () => {
      const text = "File at /home/alice/.ssh/id_rsa";
      const redacted = redactPaths(text);
      expect(redacted).not.toContain("/home/alice");
      expect(redacted).toContain("[REDACTED_PATH]");
    });

    it("redacts macOS home directories", () => {
      const text = "Config: /Users/bob/.moltbot/config.json";
      const redacted = redactPaths(text);
      expect(redacted).not.toContain("/Users/bob");
      expect(redacted).toContain("[REDACTED_PATH]");
    });

    it("redacts Windows user directories", () => {
      const text = "Path: C:\\Users\\Charlie\\Documents\\secret.txt";
      const redacted = redactPaths(text);
      expect(redacted).not.toContain("C:\\Users\\Charlie");
      expect(redacted).toContain("[REDACTED_PATH]");
    });

    it("converts home directory to tilde", () => {
      const text = "~/.ssh/id_rsa";
      const redacted = redactPaths(text);
      expect(redacted).toContain("[REDACTED_PATH]");
    });
  });

  describe("redactIps", () => {
    it("redacts private 10.x IPs", () => {
      const text = "Server at 10.0.1.5";
      const redacted = redactIps(text);
      expect(redacted).not.toContain("10.0.1.5");
      expect(redacted).toContain("[REDACTED_IP]");
    });

    it("redacts private 192.168 IPs", () => {
      const text = "Gateway: 192.168.1.1";
      const redacted = redactIps(text);
      expect(redacted).not.toContain("192.168.1.1");
      expect(redacted).toContain("[REDACTED_IP]");
    });

    it("redacts private 172.16-31 IPs", () => {
      const text = "Internal: 172.16.0.10";
      const redacted = redactIps(text);
      expect(redacted).not.toContain("172.16.0.10");
      expect(redacted).toContain("[REDACTED_IP]");
    });

    it("redacts loopback IPs", () => {
      const text = "Localhost: 127.0.0.1";
      const redacted = redactIps(text);
      expect(redacted).not.toContain("127.0.0.1");
      expect(redacted).toContain("[REDACTED_IP]");
    });

    it("preserves public IPs (optional)", () => {
      const text = "Public: 8.8.8.8";
      const redacted = redactIps(text);
      // Public IPs not redacted by default
      expect(redacted).toContain("8.8.8.8");
    });
  });

  describe("redactEmails", () => {
    it("redacts email addresses", () => {
      const text = "Contact: alice@example.com";
      const redacted = redactEmails(text);
      expect(redacted).not.toContain("alice@example.com");
      expect(redacted).toContain("[REDACTED_EMAIL]");
    });

    it("redacts multiple emails", () => {
      const text = "Send to bob@test.com or charlie@test.org";
      const redacted = redactEmails(text);
      expect(redacted).not.toContain("@");
      expect(redacted.match(/\[REDACTED_EMAIL\]/g)?.length).toBe(2);
    });
  });

  describe("redactCreditCards", () => {
    it("redacts 16-digit credit cards", () => {
      const text = "Card: 4532-1234-5678-9010";
      const redacted = redactCreditCards(text);
      expect(redacted).not.toContain("4532");
      expect(redacted).toContain("[REDACTED_CARD]");
    });

    it("redacts Amex cards", () => {
      const text = "Amex: 3712-345678-90123";
      const redacted = redactCreditCards(text);
      expect(redacted).not.toContain("3712");
      expect(redacted).toContain("[REDACTED_CARD]");
    });

    it("redacts cards without separators", () => {
      const text = "Card: 4532123456789010";
      const redacted = redactCreditCards(text);
      expect(redacted).not.toContain("4532123456789010");
      expect(redacted).toContain("[REDACTED_CARD]");
    });
  });

  describe("redactSsns", () => {
    it("redacts formatted SSNs", () => {
      const text = "SSN: 123-45-6789";
      const redacted = redactSsns(text);
      expect(redacted).not.toContain("123-45-6789");
      expect(redacted).toContain("[REDACTED_SSN]");
    });

    it("redacts 9-digit numbers (potential SSNs)", () => {
      const text = "ID: 123456789";
      const redacted = redactSsns(text);
      expect(redacted).not.toContain("123456789");
      expect(redacted).toContain("[REDACTED_SSN]");
    });
  });

  describe("redactStackTrace", () => {
    it("redacts file paths in stack traces", () => {
      const stackTrace = `Error: Something went wrong
    at Function.doStuff (/home/user/project/src/index.ts:42:10)
    at main (/home/user/project/src/main.ts:15:5)`;
      
      const redacted = redactStackTrace(stackTrace);
      expect(redacted).not.toContain("/home/user");
      expect(redacted).toContain("[REDACTED_PATH]");
      expect(redacted).toContain("doStuff");  // Function name preserved
    });

    it("preserves error message", () => {
      const stackTrace = "Error: Something went wrong\n    at main";
      const redacted = redactStackTrace(stackTrace);
      expect(redacted).toContain("Something went wrong");
    });
  });

  describe("redactSensitiveInfo", () => {
    it("redacts all types by default", () => {
      const text = `User: alice@example.com
Password: secret123
API Key: sk-ant-FAKE-TEST-KEY-NOT-REAL
File: /home/alice/.ssh/id_rsa
IP: 192.168.1.100
Card: 4532-1234-5678-9010`;
      
      const redacted = redactSensitiveInfo(text);
      expect(redacted).not.toContain("alice@example.com");
      expect(redacted).not.toContain("secret123");
      expect(redacted).not.toContain("sk-ant");
      expect(redacted).not.toContain("/home/alice");
      expect(redacted).not.toContain("192.168.1.100");
      expect(redacted).not.toContain("4532-1234-5678-9010");
      expect(redacted).toContain("[REDACTED]");
    });

    it("respects options", () => {
      const text = "IP: 192.168.1.100 Email: test@example.com";
      const redacted = redactSensitiveInfo(text, {
        redactIps: false,
        redactEmails: true,
      });
      expect(redacted).toContain("192.168.1.100");  // Not redacted
      expect(redacted).not.toContain("test@example.com");  // Redacted
    });

    it("uses custom placeholder", () => {
      const text = "Password: secret123";
      const redacted = redactSensitiveInfo(text, { placeholder: "[HIDDEN]" });
      expect(redacted).toContain("[HIDDEN]");
      expect(redacted).not.toContain("[REDACTED]");
    });
  });

  describe("redactError", () => {
    it("redacts error messages", () => {
      const error = new Error("Failed to read /home/alice/.ssh/id_rsa");
      const redacted = redactError(error);
      expect(redacted.message).not.toContain("/home/alice");
      expect(redacted.message).toContain("[REDACTED]");
    });

    it("redacts stack traces", () => {
      const error = new Error("Test error");
      error.stack = `Error: Test error
    at test (/home/alice/project/test.ts:10:5)`;
      
      const redacted = redactError(error);
      expect(redacted.stack).not.toContain("/home/alice");
      expect(redacted.stack).toContain("[REDACTED_PATH]");
    });

    it("preserves error type", () => {
      const error = new TypeError("Type mismatch");
      const redacted = redactError(error);
      expect(redacted.name).toBe("TypeError");
    });

    it("handles non-Error objects", () => {
      const notAnError = { message: "Not an error" };
      const redacted = redactError(notAnError);
      expect(redacted).toBeInstanceOf(Error);
      expect(redacted.message).toBe("[Redacted error]");
    });
  });

  describe("containsSensitiveInfo", () => {
    it("detects tokens", () => {
      expect(containsSensitiveInfo("sk-ant-FAKE-TEST")).toBe(true);
      expect(containsSensitiveInfo("ghp-FAKE-TEST")).toBe(true);
    });

    it("detects passwords", () => {
      expect(containsSensitiveInfo('password="secret123"')).toBe(true);
      expect(containsSensitiveInfo("api_key: abc123")).toBe(true);
    });

    it("detects credit cards", () => {
      expect(containsSensitiveInfo("4532-1234-5678-9010")).toBe(true);
    });

    it("detects SSNs", () => {
      expect(containsSensitiveInfo("123-45-6789")).toBe(true);
    });

    it("returns false for normal text", () => {
      expect(containsSensitiveInfo("This is a normal message")).toBe(false);
      expect(containsSensitiveInfo("No secrets here!")).toBe(false);
    });
  });
});
