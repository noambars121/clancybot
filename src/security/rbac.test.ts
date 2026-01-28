import { describe, it, expect } from "vitest";
import {
  hasPermission,
  checkFileAccess,
  checkToolAccess,
  checkGatewayMethodAccess,
  resolveRole,
  isSensitivePath,
  isOutsideWorkspace,
  type Role,
  type AccessContext,
} from "./rbac.js";
import type { MoltbotConfig } from "../config/schema.js";
import { homedir } from "node:os";
import { join } from "node:path";

describe("RBAC", () => {
  describe("hasPermission", () => {
    it("admin has all permissions", () => {
      expect(hasPermission("admin", "tools.exec")).toBe(true);
      expect(hasPermission("admin", "tools.exec.elevated")).toBe(true);
      expect(hasPermission("admin", "admin.secrets.read")).toBe(true);
      expect(hasPermission("admin", "gateway.config.write")).toBe(true);
    });

    it("user has standard permissions", () => {
      expect(hasPermission("user", "tools.exec")).toBe(true);
      expect(hasPermission("user", "tools.filesystem.read")).toBe(true);
      expect(hasPermission("user", "gateway.config.read")).toBe(true);
    });

    it("user lacks admin permissions", () => {
      expect(hasPermission("user", "tools.exec.elevated")).toBe(false);
      expect(hasPermission("user", "admin.secrets.write")).toBe(false);
      expect(hasPermission("user", "gateway.config.write")).toBe(false);
    });

    it("restricted has limited permissions", () => {
      expect(hasPermission("restricted", "tools.filesystem.read")).toBe(true);
      expect(hasPermission("restricted", "tools.filesystem.write")).toBe(false);
      expect(hasPermission("restricted", "tools.exec")).toBe(false);
    });

    it("guest has minimal permissions", () => {
      expect(hasPermission("guest", "tools.filesystem.read")).toBe(true);
      expect(hasPermission("guest", "tools.filesystem.write")).toBe(false);
      expect(hasPermission("guest", "tools.exec")).toBe(false);
      expect(hasPermission("guest", "gateway.config.write")).toBe(false);
    });
  });

  describe("isSensitivePath", () => {
    it("detects AWS credentials", () => {
      expect(isSensitivePath(join(homedir(), ".aws", "credentials"))).toBe(true);
      expect(isSensitivePath("~/.aws/credentials")).toBe(true);
    });

    it("detects SSH keys", () => {
      expect(isSensitivePath(join(homedir(), ".ssh", "id_rsa"))).toBe(true);
      expect(isSensitivePath("~/.ssh/id_ed25519")).toBe(true);
      expect(isSensitivePath("/home/user/.ssh/authorized_keys")).toBe(true);
    });

    it("detects .env files", () => {
      expect(isSensitivePath(".env")).toBe(true);
      expect(isSensitivePath(".env.local")).toBe(true);
      expect(isSensitivePath("/app/.env.production")).toBe(true);
    });

    it("detects private keys", () => {
      expect(isSensitivePath("private.key")).toBe(true);
      expect(isSensitivePath("server.pem")).toBe(true);
      expect(isSensitivePath("/etc/ssl/private/key.pem")).toBe(true);
    });

    it("detects Moltbot credentials", () => {
      expect(isSensitivePath("~/.moltbot/credentials/discord.json")).toBe(true);
    });

    it("detects system paths", () => {
      expect(isSensitivePath("/etc/shadow")).toBe(true);
      expect(isSensitivePath("/etc/passwd")).toBe(true);
    });

    it("allows non-sensitive paths", () => {
      expect(isSensitivePath("/home/user/documents/report.txt")).toBe(false);
      expect(isSensitivePath("package.json")).toBe(false);
      expect(isSensitivePath("/app/src/index.ts")).toBe(false);
    });
  });

  describe("isOutsideWorkspace", () => {
    const workspace = "/home/user/project";

    it("detects paths outside workspace", () => {
      expect(isOutsideWorkspace("/home/user/other", workspace)).toBe(true);
      expect(isOutsideWorkspace("/etc/hosts", workspace)).toBe(true);
      expect(isOutsideWorkspace("../../../etc/passwd", workspace)).toBe(true);
    });

    it("allows paths inside workspace", () => {
      expect(isOutsideWorkspace("/home/user/project/src/index.ts", workspace)).toBe(false);
      expect(isOutsideWorkspace("src/index.ts", workspace)).toBe(false);
    });
  });

  describe("checkFileAccess", () => {
    const workspace = "/home/user/project";

    it("admin can access sensitive files", () => {
      const ctx: AccessContext = { role: "admin" };
      const result = checkFileAccess(ctx, "~/.aws/credentials", "read", workspace);
      expect(result.allowed).toBe(true);
    });

    it("user cannot access sensitive files", () => {
      const ctx: AccessContext = { role: "user" };
      const result = checkFileAccess(ctx, "~/.ssh/id_rsa", "read", workspace);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Sensitive path requires admin role");
      expect(result.requiresApproval).toBe(true);
    });

    it("user can read workspace files", () => {
      const ctx: AccessContext = { role: "user" };
      const result = checkFileAccess(ctx, "/home/user/project/README.md", "read", workspace);
      expect(result.allowed).toBe(true);
    });

    it("restricted cannot write", () => {
      const ctx: AccessContext = { role: "restricted" };
      const result = checkFileAccess(ctx, "/home/user/project/file.txt", "write", workspace);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("lacks permission");
    });

    it("guest cannot access outside workspace", () => {
      const ctx: AccessContext = { role: "guest" };
      const result = checkFileAccess(ctx, "/etc/hosts", "read", workspace);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Access outside workspace denied");
    });

    it("user can delete files (with permission)", () => {
      const ctx: AccessContext = { role: "user" };
      const result = checkFileAccess(ctx, "/home/user/project/temp.txt", "delete", workspace);
      expect(result.allowed).toBe(false); // User doesn't have delete permission
    });

    it("admin can delete files", () => {
      const ctx: AccessContext = { role: "admin" };
      const result = checkFileAccess(ctx, "/home/user/project/temp.txt", "delete", workspace);
      expect(result.allowed).toBe(true);
    });
  });

  describe("checkToolAccess", () => {
    it("user can use exec tool", () => {
      const ctx: AccessContext = { role: "user" };
      const result = checkToolAccess(ctx, "exec", { command: "ls" });
      expect(result.allowed).toBe(true);
    });

    it("user cannot use elevated exec", () => {
      const ctx: AccessContext = { role: "user" };
      const result = checkToolAccess(ctx, "exec", { elevated: true });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Elevated exec requires admin role");
      expect(result.requiresApproval).toBe(true);
    });

    it("admin can use elevated exec (when enabled)", () => {
      const ctx: AccessContext = {
        role: "admin",
        elevatedEnabled: true,
        elevatedAllowed: true,
      };
      const result = checkToolAccess(ctx, "exec", { elevated: true });
      expect(result.allowed).toBe(true);
    });

    it("admin cannot use elevated exec when disabled", () => {
      const ctx: AccessContext = {
        role: "admin",
        elevatedEnabled: false,
        elevatedAllowed: false,
      };
      const result = checkToolAccess(ctx, "exec", { elevated: true });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not enabled/allowed");
    });

    it("restricted cannot use exec", () => {
      const ctx: AccessContext = { role: "restricted" };
      const result = checkToolAccess(ctx, "exec", { command: "ls" });
      expect(result.allowed).toBe(false);
    });

    it("user can use read/write tools", () => {
      const ctx: AccessContext = { role: "user" };
      expect(checkToolAccess(ctx, "read").allowed).toBe(true);
      expect(checkToolAccess(ctx, "write").allowed).toBe(true);
      expect(checkToolAccess(ctx, "glob").allowed).toBe(true);
    });

    it("restricted can only read", () => {
      const ctx: AccessContext = { role: "restricted" };
      expect(checkToolAccess(ctx, "read").allowed).toBe(true);
      expect(checkToolAccess(ctx, "write").allowed).toBe(false);
      expect(checkToolAccess(ctx, "delete").allowed).toBe(false);
    });

    it("user can use cron tools", () => {
      const ctx: AccessContext = { role: "user" };
      expect(checkToolAccess(ctx, "cron_add").allowed).toBe(true);
      expect(checkToolAccess(ctx, "cron_list").allowed).toBe(true);
      expect(checkToolAccess(ctx, "cron_remove").allowed).toBe(true);
    });

    it("guest has minimal tool access", () => {
      const ctx: AccessContext = { role: "guest" };
      expect(checkToolAccess(ctx, "read").allowed).toBe(true);
      expect(checkToolAccess(ctx, "write").allowed).toBe(false);
      expect(checkToolAccess(ctx, "exec").allowed).toBe(false);
      expect(checkToolAccess(ctx, "browser_navigate").allowed).toBe(false);
    });
  });

  describe("checkGatewayMethodAccess", () => {
    it("user can read config", () => {
      const ctx: AccessContext = { role: "user" };
      const result = checkGatewayMethodAccess(ctx, "config.get");
      expect(result.allowed).toBe(true);
    });

    it("user cannot write config", () => {
      const ctx: AccessContext = { role: "user" };
      const result = checkGatewayMethodAccess(ctx, "config.set");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("lacks permission");
    });

    it("admin can write config", () => {
      const ctx: AccessContext = { role: "admin" };
      const result = checkGatewayMethodAccess(ctx, "config.set");
      expect(result.allowed).toBe(true);
    });

    it("admin can approve pairing", () => {
      const ctx: AccessContext = { role: "admin" };
      const result = checkGatewayMethodAccess(ctx, "pairing.approve");
      expect(result.allowed).toBe(true);
    });

    it("user cannot approve pairing", () => {
      const ctx: AccessContext = { role: "user" };
      const result = checkGatewayMethodAccess(ctx, "pairing.approve");
      expect(result.allowed).toBe(false);
    });

    it("restricted has minimal gateway access", () => {
      const ctx: AccessContext = { role: "restricted" };
      expect(checkGatewayMethodAccess(ctx, "config.get").allowed).toBe(true);
      expect(checkGatewayMethodAccess(ctx, "config.set").allowed).toBe(false);
      expect(checkGatewayMethodAccess(ctx, "sessions.list").allowed).toBe(false);
    });
  });

  describe("resolveRole", () => {
    it("resolves admin by accountId", () => {
      const cfg: Partial<MoltbotConfig> = {
        security: {
          rbac: {
            adminAccountIds: ["alice@example.com"],
            adminChannels: [],
          },
        },
      };
      const ctx = { accountId: "alice@example.com" };
      expect(resolveRole(ctx, cfg as MoltbotConfig)).toBe("admin");
    });

    it("resolves admin by channel", () => {
      const cfg: Partial<MoltbotConfig> = {
        security: {
          rbac: {
            adminAccountIds: [],
            adminChannels: ["telegram"],
          },
        },
      };
      const ctx = { channel: "telegram" };
      expect(resolveRole(ctx, cfg as MoltbotConfig)).toBe("admin");
    });

    it("defaults to user role", () => {
      const cfg: Partial<MoltbotConfig> = {
        security: {
          rbac: {
            adminAccountIds: [],
            adminChannels: [],
          },
        },
      };
      const ctx = { accountId: "bob@example.com" };
      expect(resolveRole(ctx, cfg as MoltbotConfig)).toBe("user");
    });

    it("handles missing security config", () => {
      const cfg: Partial<MoltbotConfig> = {};
      const ctx = { accountId: "charlie@example.com" };
      expect(resolveRole(ctx, cfg as MoltbotConfig)).toBe("user");
    });
  });
});
