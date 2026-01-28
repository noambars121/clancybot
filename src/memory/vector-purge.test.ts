/**
 * Tests for Vector Purge
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryVectorPurge,
  VectorPurgeFactory,
  detectVectorDB,
  type VectorPurgeOptions,
} from "./vector-purge.js";

describe("InMemoryVectorPurge", () => {
  let purge: InMemoryVectorPurge;
  let options: VectorPurgeOptions;

  beforeEach(() => {
    purge = new InMemoryVectorPurge();
    options = {
      threshold: 0.8,
      limit: 10,
      dryRun: false,
    };
  });

  describe("search", () => {
    it("should find matching vectors", async () => {
      purge.add("vec1", "My password is secret");
      purge.add("vec2", "No match here");
      purge.add("vec3", "Another password mention");

      const matches = await purge.search("password", options);

      expect(matches.length).toBe(2);
      expect(matches.every((m) => m.text.includes("password"))).toBe(true);
    });

    it("should be case-insensitive", async () => {
      purge.add("vec1", "My PASSWORD is here");

      const matches = await purge.search("password", options);

      expect(matches.length).toBe(1);
    });

    it("should respect limit", async () => {
      for (let i = 0; i < 20; i++) {
        purge.add(`vec${i}`, `password ${i}`);
      }

      const matches = await purge.search("password", { ...options, limit: 5 });

      expect(matches.length).toBe(5);
    });

    it("should return empty array for no matches", async () => {
      purge.add("vec1", "No secrets here");

      const matches = await purge.search("password", options);

      expect(matches).toEqual([]);
    });

    it("should include vector IDs", async () => {
      purge.add("vec-123", "password here");

      const matches = await purge.search("password", options);

      expect(matches[0].id).toBe("vec-123");
    });

    it("should set similarity to 1.0 for exact contains", async () => {
      purge.add("vec1", "contains password");

      const matches = await purge.search("password", options);

      expect(matches[0].similarity).toBe(1.0);
    });
  });

  describe("delete", () => {
    it("should delete vectors by ID", async () => {
      purge.add("vec1", "text 1");
      purge.add("vec2", "text 2");
      purge.add("vec3", "text 3");

      const deleted = await purge.delete(["vec1", "vec3"]);

      expect(deleted).toBe(2);
      expect(await purge.count()).toBe(1);
    });

    it("should return count of deleted vectors", async () => {
      purge.add("vec1", "text 1");

      const deleted = await purge.delete(["vec1"]);

      expect(deleted).toBe(1);
    });

    it("should handle deleting non-existent IDs", async () => {
      const deleted = await purge.delete(["nonexistent"]);

      expect(deleted).toBe(0);
    });

    it("should handle empty ID list", async () => {
      purge.add("vec1", "text 1");

      const deleted = await purge.delete([]);

      expect(deleted).toBe(0);
      expect(await purge.count()).toBe(1);
    });
  });

  describe("reindex", () => {
    it("should complete without error", async () => {
      await expect(purge.reindex()).resolves.not.toThrow();
    });
  });

  describe("count", () => {
    it("should return vector count", async () => {
      expect(await purge.count()).toBe(0);

      purge.add("vec1", "text 1");
      purge.add("vec2", "text 2");

      expect(await purge.count()).toBe(2);
    });

    it("should update after deletion", async () => {
      purge.add("vec1", "text 1");
      purge.add("vec2", "text 2");

      await purge.delete(["vec1"]);

      expect(await purge.count()).toBe(1);
    });
  });

  describe("helper methods", () => {
    it("should add vectors", () => {
      purge.add("vec1", "text 1", [0.1, 0.2, 0.3]);

      expect(purge["vectors"].size).toBe(1);
      expect(purge["vectors"].get("vec1")?.text).toBe("text 1");
    });

    it("should clear vectors", () => {
      purge.add("vec1", "text 1");
      purge.add("vec2", "text 2");

      purge.clear();

      expect(purge["vectors"].size).toBe(0);
    });
  });
});

describe("VectorPurgeFactory", () => {
  it("should create in-memory instance by default", () => {
    const purge = VectorPurgeFactory.create("memory");

    expect(purge).toBeInstanceOf(InMemoryVectorPurge);
  });

  it("should create Chroma instance", () => {
    const purge = VectorPurgeFactory.create("chroma", {
      collectionName: "test",
    });

    expect(purge).toBeDefined();
  });

  it("should create FAISS instance", () => {
    const purge = VectorPurgeFactory.create("faiss", {
      indexPath: "/path/to/index",
    });

    expect(purge).toBeDefined();
  });

  it("should create Pinecone instance", () => {
    const purge = VectorPurgeFactory.create("pinecone", {
      indexName: "test-index",
      apiKey: "test-key",
    });

    expect(purge).toBeDefined();
  });

  it("should fallback to in-memory for unknown type", () => {
    const purge = VectorPurgeFactory.create("unknown" as any);

    expect(purge).toBeInstanceOf(InMemoryVectorPurge);
  });
});

describe("detectVectorDB", () => {
  it("should detect from environment variable", () => {
    process.env.VECTOR_DB_TYPE = "chroma";

    const detected = detectVectorDB();

    expect(detected).toBe("chroma");

    delete process.env.VECTOR_DB_TYPE;
  });

  it("should default to memory", () => {
    delete process.env.VECTOR_DB_TYPE;

    const detected = detectVectorDB();

    expect(detected).toBe("memory");
  });
});

describe("integration", () => {
  it("should search and delete workflow", async () => {
    const purge = new InMemoryVectorPurge();

    // Add test data
    purge.add("vec1", "My password is secret");
    purge.add("vec2", "No sensitive data");
    purge.add("vec3", "Another password mention");

    // Search
    const matches = await purge.search("password", {
      threshold: 0.8,
      limit: 10,
      dryRun: false,
    });

    expect(matches.length).toBe(2);

    // Delete
    const ids = matches.map((m) => m.id);
    const deleted = await purge.delete(ids);

    expect(deleted).toBe(2);

    // Verify
    const remaining = await purge.search("password", {
      threshold: 0.8,
      limit: 10,
      dryRun: false,
    });

    expect(remaining.length).toBe(0);
  });
});
