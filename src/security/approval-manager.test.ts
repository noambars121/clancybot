import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  assessOperationRisk,
  createApprovalRequest,
  getApprovalRequest,
  listPendingApprovals,
  approveRequest,
  denyRequest,
  expirePendingApprovals,
  getApprovalHistory,
  clearApprovalHistory,
  formatApprovalRequest,
  type ApprovalStatus,
} from "./approval-manager.js";
import type { MoltbotConfig } from "../config/schema.js";

describe("ApprovalManager", () => {
  beforeEach(() => {
    clearApprovalHistory();
  });

  afterEach(() => {
    clearApprovalHistory();
  });

  describe("assessOperationRisk", () => {
    const cfg: Partial<MoltbotConfig> = {};

    it("requires approval for file deletion", () => {
      const result = assessOperationRisk("delete", { path: "file.txt" }, cfg as MoltbotConfig);
      expect(result.requiresApproval).toBe(true);
      expect(result.riskLevel).toBe("high");
      expect(result.reason).toContain("destructive");
    });

    it("requires approval for elevated exec", () => {
      const result = assessOperationRisk("exec", { command: "ls", elevated: true }, cfg as MoltbotConfig);
      expect(result.requiresApproval).toBe(true);
      expect(result.riskLevel).toBe("critical");
      expect(result.reason).toContain("Elevated");
    });

    it("allows normal exec", () => {
      const result = assessOperationRisk("exec", { command: "ls" }, cfg as MoltbotConfig);
      expect(result.requiresApproval).toBe(false);
      expect(result.riskLevel).toBe("low");
    });

    it("requires approval for sensitive file write", () => {
      const result = assessOperationRisk("write", { path: "~/.ssh/id_rsa" }, cfg as MoltbotConfig);
      expect(result.requiresApproval).toBe(true);
      expect(result.riskLevel).toBe("critical");
      expect(result.reason).toContain("sensitive");
    });

    it("requires approval for sensitive file read", () => {
      const result = assessOperationRisk("read", { path: ".env" }, cfg as MoltbotConfig);
      expect(result.requiresApproval).toBe(true);
      expect(result.riskLevel).toBe("high");
    });

    it("allows normal file read", () => {
      const result = assessOperationRisk("read", { path: "README.md" }, cfg as MoltbotConfig);
      expect(result.requiresApproval).toBe(false);
    });

    it("requires approval for non-allowlisted network access", () => {
      const cfgWithAllowlist: Partial<MoltbotConfig> = {
        security: {
          network: {
            allowedHosts: ["api.example.com"],
          },
        },
      };
      
      const result = assessOperationRisk(
        "fetch",
        { url: "https://evil.com/data" },
        cfgWithAllowlist as MoltbotConfig,
      );
      expect(result.requiresApproval).toBe(true);
      expect(result.riskLevel).toBe("medium");
    });

    it("allows allowlisted network access", () => {
      const cfgWithAllowlist: Partial<MoltbotConfig> = {
        security: {
          network: {
            allowedHosts: ["api.example.com"],
          },
        },
      };
      
      const result = assessOperationRisk(
        "fetch",
        { url: "https://api.example.com/data" },
        cfgWithAllowlist as MoltbotConfig,
      );
      expect(result.requiresApproval).toBe(false);
    });

    it("requires approval for config changes", () => {
      const result = assessOperationRisk("config.set", { key: "gateway.port", value: 8080 }, cfg as MoltbotConfig);
      expect(result.requiresApproval).toBe(true);
      expect(result.riskLevel).toBe("high");
    });

    it("requires approval for session deletion", () => {
      const result = assessOperationRisk("sessions.delete", { sessionKey: "abc123" }, cfg as MoltbotConfig);
      expect(result.requiresApproval).toBe(true);
      expect(result.riskLevel).toBe("medium");
    });

    it("requires approval for cron jobs", () => {
      const result = assessOperationRisk("cron_add", { schedule: {}, payload: {} }, cfg as MoltbotConfig);
      expect(result.requiresApproval).toBe(true);
      expect(result.riskLevel).toBe("medium");
      expect(result.reason).toContain("scheduled");
    });

    it("requires approval for bulk messaging", () => {
      const result = assessOperationRisk("message_send", { to: new Array(20).fill("user") }, cfg as MoltbotConfig);
      expect(result.requiresApproval).toBe(true);
      expect(result.riskLevel).toBe("medium");
      expect(result.reason).toContain("Bulk");
    });

    it("allows single message sending", () => {
      const result = assessOperationRisk("message_send", { to: "user@example.com" }, cfg as MoltbotConfig);
      expect(result.requiresApproval).toBe(false);
    });
  });

  describe("createApprovalRequest", () => {
    it("creates a pending approval request", () => {
      const request = createApprovalRequest(
        "delete",
        { path: "important.txt" },
        { sessionKey: "session-123", accountId: "user@example.com" },
      );

      expect(request.id).toBeDefined();
      expect(request.operation).toBe("delete");
      expect(request.details.path).toBe("important.txt");
      expect(request.sessionKey).toBe("session-123");
      expect(request.accountId).toBe("user@example.com");
      expect(request.timestamp).toBeGreaterThan(0);

      const stored = getApprovalRequest(request.id);
      expect(stored).toBeDefined();
      expect(stored?.status).toBe("pending");
    });

    it("adds request to pending list", () => {
      createApprovalRequest("delete", { path: "file.txt" }, {});
      
      const pending = listPendingApprovals();
      expect(pending.length).toBe(1);
      expect(pending[0].operation).toBe("delete");
    });

    it("adds request to history", () => {
      createApprovalRequest("delete", { path: "file.txt" }, {});
      
      const history = getApprovalHistory();
      expect(history.length).toBe(1);
    });
  });

  describe("approveRequest", () => {
    it("approves a pending request", () => {
      const request = createApprovalRequest("delete", { path: "file.txt" }, {});
      
      const approved = approveRequest(request.id, "admin@example.com");
      
      expect(approved).toBeDefined();
      expect(approved?.status).toBe("approved");
      expect(approved?.respondedBy).toBe("admin@example.com");
      expect(approved?.respondedAt).toBeGreaterThan(0);
    });

    it("removes from pending list", () => {
      const request = createApprovalRequest("delete", { path: "file.txt" }, {});
      approveRequest(request.id, "admin");
      
      const pending = listPendingApprovals();
      expect(pending.length).toBe(0);
    });

    it("keeps in history", () => {
      const request = createApprovalRequest("delete", { path: "file.txt" }, {});
      approveRequest(request.id, "admin");
      
      const history = getApprovalHistory();
      expect(history.length).toBe(1);
      expect(history[0].status).toBe("approved");
    });

    it("returns undefined for unknown ID", () => {
      const result = approveRequest("unknown-id", "admin");
      expect(result).toBeUndefined();
    });

    it("does not re-approve already processed request", () => {
      const request = createApprovalRequest("delete", { path: "file.txt" }, {});
      approveRequest(request.id, "admin");
      
      const result = approveRequest(request.id, "another-admin");
      expect(result?.status).toBe("approved");
      expect(result?.respondedBy).toBe("admin");  // Original responder
    });
  });

  describe("denyRequest", () => {
    it("denies a pending request", () => {
      const request = createApprovalRequest("delete", { path: "file.txt" }, {});
      
      const denied = denyRequest(request.id, "admin@example.com");
      
      expect(denied).toBeDefined();
      expect(denied?.status).toBe("denied");
      expect(denied?.respondedBy).toBe("admin@example.com");
    });

    it("removes from pending list", () => {
      const request = createApprovalRequest("delete", { path: "file.txt" }, {});
      denyRequest(request.id, "admin");
      
      const pending = listPendingApprovals();
      expect(pending.length).toBe(0);
    });

    it("keeps in history", () => {
      const request = createApprovalRequest("delete", { path: "file.txt" }, {});
      denyRequest(request.id, "admin");
      
      const history = getApprovalHistory();
      expect(history.length).toBe(1);
      expect(history[0].status).toBe("denied");
    });
  });

  describe("listPendingApprovals", () => {
    it("lists all pending approvals", () => {
      createApprovalRequest("delete", { path: "file1.txt" }, {});
      createApprovalRequest("delete", { path: "file2.txt" }, {});
      
      const pending = listPendingApprovals();
      expect(pending.length).toBe(2);
    });

    it("filters by sessionKey", () => {
      createApprovalRequest("delete", { path: "file1.txt" }, { sessionKey: "session-1" });
      createApprovalRequest("delete", { path: "file2.txt" }, { sessionKey: "session-2" });
      
      const filtered = listPendingApprovals({ sessionKey: "session-1" });
      expect(filtered.length).toBe(1);
      expect(filtered[0].sessionKey).toBe("session-1");
    });

    it("filters by accountId", () => {
      createApprovalRequest("delete", { path: "file1.txt" }, { accountId: "user1" });
      createApprovalRequest("delete", { path: "file2.txt" }, { accountId: "user2" });
      
      const filtered = listPendingApprovals({ accountId: "user1" });
      expect(filtered.length).toBe(1);
      expect(filtered[0].accountId).toBe("user1");
    });

    it("filters by channel", () => {
      createApprovalRequest("delete", { path: "file1.txt" }, { channel: "telegram" });
      createApprovalRequest("delete", { path: "file2.txt" }, { channel: "discord" });
      
      const filtered = listPendingApprovals({ channel: "telegram" });
      expect(filtered.length).toBe(1);
      expect(filtered[0].channel).toBe("telegram");
    });

    it("excludes approved/denied requests", () => {
      const request1 = createApprovalRequest("delete", { path: "file1.txt" }, {});
      const request2 = createApprovalRequest("delete", { path: "file2.txt" }, {});
      
      approveRequest(request1.id, "admin");
      
      const pending = listPendingApprovals();
      expect(pending.length).toBe(1);
      expect(pending[0].id).toBe(request2.id);
    });
  });

  describe("expirePendingApprovals", () => {
    it("expires old requests", () => {
      vi.useFakeTimers();
      
      const request = createApprovalRequest("delete", { path: "file.txt" }, {});
      
      // Advance time by 2 hours
      vi.advanceTimersByTime(2 * 3600000);
      
      const expired = expirePendingApprovals(3600000);  // 1 hour max age
      
      expect(expired).toBe(1);
      
      const stored = getApprovalRequest(request.id);
      expect(stored).toBeUndefined();  // Removed from pending
      
      const history = getApprovalHistory();
      expect(history[0].status).toBe("expired");
      
      vi.useRealTimers();
    });

    it("does not expire recent requests", () => {
      vi.useFakeTimers();
      
      createApprovalRequest("delete", { path: "file.txt" }, {});
      
      // Advance time by 30 minutes
      vi.advanceTimersByTime(30 * 60000);
      
      const expired = expirePendingApprovals(3600000);  // 1 hour max age
      
      expect(expired).toBe(0);
      
      const pending = listPendingApprovals();
      expect(pending.length).toBe(1);
      
      vi.useRealTimers();
    });
  });

  describe("formatApprovalRequest", () => {
    it("formats approval request for display", () => {
      const request = createApprovalRequest(
        "delete",
        { path: "/important/file.txt" },
        { sessionKey: "session-123" },
      );
      
      const formatted = formatApprovalRequest(request);
      
      expect(formatted).toContain("Approval Required");
      expect(formatted).toContain("Operation: delete");
      expect(formatted).toContain("/important/file.txt");
      expect(formatted).toContain(request.id);
      expect(formatted).toContain("approve");
      expect(formatted).toContain("deny");
    });
  });
});
