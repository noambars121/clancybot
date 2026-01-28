import { describe, expect, it } from "vitest";
import {
  shouldPruneResponse,
  pruneToolResponse,
  formatPruningStats,
} from "./response-pruning.js";

describe("response-pruning", () => {
  describe("shouldPruneResponse", () => {
    it("should prune gateway config.schema responses", () => {
      const response = {
        ok: true,
        result: {
          type: "object",
          properties: {
            gateway: { type: "object" },
            channels: { type: "object" },
            // ... 100+ more properties
          },
          definitions: {},
        },
      };
      
      expect(shouldPruneResponse("gateway", response)).toBe(true);
    });
    
    it("should prune large responses (>10KB)", () => {
      const largeArray = Array(1000).fill({ data: "x".repeat(100) });
      expect(shouldPruneResponse("some_tool", largeArray)).toBe(true);
    });
    
    it("should not prune small responses", () => {
      const small = { ok: true, count: 5 };
      expect(shouldPruneResponse("some_tool", small)).toBe(false);
    });
  });
  
  describe("pruneToolResponse", () => {
    it("should replace gateway schema with summary", () => {
      const response = {
        ok: true,
        result: {
          type: "object",
          properties: {
            prop1: {},
            prop2: {},
            prop3: {},
          },
          definitions: { huge: "..." },
        },
      };
      
      const { pruned, stats } = pruneToolResponse("gateway", response);
      
      expect(stats.wasPruned).toBe(true);
      expect(stats.savedBytes).toBeGreaterThan(0);
      expect((pruned as any).result.propertyCount).toBe(3);
      expect((pruned as any).result._pruned).toBe(true);
    });
    
    it("should truncate large arrays", () => {
      const largeArray = Array(100).fill({ item: "data" });
      const { pruned, stats } = pruneToolResponse("some_tool", largeArray);
      
      expect(stats.wasPruned).toBe(true);
      expect(Array.isArray(pruned)).toBe(true);
      expect((pruned as unknown[]).length).toBeLessThan(100);
    });
    
    it("should not modify small responses", () => {
      const small = { ok: true, count: 5 };
      const { pruned, stats } = pruneToolResponse("some_tool", small);
      
      expect(stats.wasPruned).toBe(false);
      expect(pruned).toEqual(small);
    });
  });
  
  describe("formatPruningStats", () => {
    it("should format large savings", () => {
      const stats = {
        originalSize: 396000,
        prunedSize: 500,
        savedBytes: 395500,
        wasPruned: true,
      };
      
      const formatted = formatPruningStats(stats);
      expect(formatted).toContain("386.7KB");
      expect(formatted).toContain("500B");
      expect(formatted).toContain("99%");
    });
    
    it("should handle no pruning", () => {
      const stats = {
        originalSize: 100,
        prunedSize: 100,
        savedBytes: 0,
        wasPruned: false,
      };
      
      const formatted = formatPruningStats(stats);
      expect(formatted).toContain("No pruning needed");
    });
  });
});
