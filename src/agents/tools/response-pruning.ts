/**
 * Response Pruning - Phase 3 Critical Fix
 * 
 * Prevents session file bloat by pruning large tool responses.
 * Addresses GitHub Issue #1808: Session files growing to 2-3MB
 * 
 * Root Cause: Gateway tool returns 396KB config schema every call
 * Impact: Sessions exceed 208k tokens → bot becomes unresponsive
 */

const MAX_TOOL_RESPONSE_SIZE = 10_000; // 10KB max per response
const MAX_ARRAY_ITEMS = 20; // Max array items to keep
const TRUNCATION_MARKER = "... [truncated for session optimization]";

export interface PruningStats {
  originalSize: number;
  prunedSize: number;
  savedBytes: number;
  wasPruned: boolean;
}

/**
 * Check if a tool response should be pruned
 */
export function shouldPruneResponse(toolName: string, response: unknown): boolean {
  // Always prune gateway config.schema - it's massive and not needed in session
  if (toolName === "gateway" && isGatewaySchemaResponse(response)) {
    return true;
  }
  
  // Prune any response larger than 10KB
  const size = estimateSize(response);
  return size > MAX_TOOL_RESPONSE_SIZE;
}

/**
 * Prune a tool response to reduce session size
 */
export function pruneToolResponse(
  toolName: string, 
  response: unknown,
): { pruned: unknown; stats: PruningStats } {
  const originalSize = estimateSize(response);
  
  // Special handling for gateway tool
  if (toolName === "gateway" && isGatewaySchemaResponse(response)) {
    const pruned = pruneGatewaySchemaResponse(response);
    const prunedSize = estimateSize(pruned);
    return {
      pruned,
      stats: {
        originalSize,
        prunedSize,
        savedBytes: originalSize - prunedSize,
        wasPruned: true,
      },
    };
  }
  
  // General pruning for large responses
  if (originalSize > MAX_TOOL_RESPONSE_SIZE) {
    const pruned = pruneGenericResponse(response);
    const prunedSize = estimateSize(pruned);
    return {
      pruned,
      stats: {
        originalSize,
        prunedSize,
        savedBytes: originalSize - prunedSize,
        wasPruned: true,
      },
    };
  }
  
  // No pruning needed
  return {
    pruned: response,
    stats: {
      originalSize,
      prunedSize: originalSize,
      savedBytes: 0,
      wasPruned: false,
    },
  };
}

/**
 * Check if response is from gateway config.schema action
 */
function isGatewaySchemaResponse(response: unknown): boolean {
  if (!response || typeof response !== "object") return false;
  const obj = response as Record<string, unknown>;
  
  // Check if it has the typical config.schema structure
  if (obj.ok === true && obj.result && typeof obj.result === "object") {
    const result = obj.result as Record<string, unknown>;
    // Config schema has properties, definitions, etc.
    return Boolean(result.properties || result.definitions || result.$defs);
  }
  
  return false;
}

/**
 * Prune gateway config.schema response
 * Instead of 396KB schema, return just a summary
 */
function pruneGatewaySchemaResponse(response: unknown): unknown {
  const obj = response as Record<string, unknown>;
  const result = (obj.result || {}) as Record<string, unknown>;
  
  // Count top-level properties
  const properties = result.properties as Record<string, unknown> | undefined;
  const propertyCount = properties ? Object.keys(properties).length : 0;
  
  return {
    ok: true,
    result: {
      type: "object",
      description: "Moltbot configuration schema",
      propertyCount,
      note: `Full schema omitted from session (${propertyCount} top-level properties). Use config.get to read current config.`,
      _pruned: true,
      _originalSize: estimateSize(response),
    },
  };
}

/**
 * Prune generic large response
 */
function pruneGenericResponse(response: unknown): unknown {
  if (response === null || response === undefined) {
    return response;
  }
  
  // Primitives - keep as is
  if (typeof response !== "object") {
    return response;
  }
  
  // Arrays - truncate to first N items
  if (Array.isArray(response)) {
    if (response.length <= MAX_ARRAY_ITEMS) {
      return response;
    }
    return [
      ...response.slice(0, MAX_ARRAY_ITEMS),
      {
        _truncated: true,
        _omitted: response.length - MAX_ARRAY_ITEMS,
        _note: TRUNCATION_MARKER,
      },
    ];
  }
  
  // Objects - keep structure but prune nested values
  const pruned: Record<string, unknown> = {};
  const entries = Object.entries(response as Record<string, unknown>);
  
  // Keep first 20 properties
  for (const [key, value] of entries.slice(0, 20)) {
    const valueSize = estimateSize(value);
    if (valueSize > 1000) {
      // Recursively prune large nested values
      pruned[key] = pruneGenericResponse(value);
    } else {
      pruned[key] = value;
    }
  }
  
  // Add truncation marker if we skipped properties
  if (entries.length > 20) {
    pruned._truncated = true;
    pruned._omitted = entries.length - 20;
    pruned._note = TRUNCATION_MARKER;
  }
  
  return pruned;
}

/**
 * Estimate size of a value in bytes (rough approximation)
 */
function estimateSize(value: unknown): number {
  if (value === null || value === undefined) return 0;
  
  const type = typeof value;
  if (type === "boolean") return 4;
  if (type === "number") return 8;
  if (type === "string") return (value as string).length * 2;
  if (type === "object") {
    // Rough estimate: JSON.stringify length
    try {
      return JSON.stringify(value).length;
    } catch {
      return 1000; // Fallback for circular references
    }
  }
  
  return 0;
}

/**
 * Format pruning stats for logging
 */
export function formatPruningStats(stats: PruningStats): string {
  if (!stats.wasPruned) {
    return `No pruning needed (${formatBytes(stats.originalSize)})`;
  }
  
  const savingsPercent = Math.round((stats.savedBytes / stats.originalSize) * 100);
  return `Pruned: ${formatBytes(stats.originalSize)} → ${formatBytes(stats.prunedSize)} (saved ${formatBytes(stats.savedBytes)}, ${savingsPercent}%)`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
