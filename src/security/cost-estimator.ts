/**
 * Cost Estimator - Phase 3 Critical Fix
 * 
 * Estimates API costs before executing requests.
 * Prevents surprise bills like $300 in 2 days.
 */

import type { TokenUsage } from "./token-budget.js";

export interface CostEstimate {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  currency: "USD";
  provider: string;
  model: string;
  breakdown: {
    promptCost: number;
    completionCost: number;
  };
}

/**
 * Pricing per 1M tokens (as of 2026-01)
 * Source: Official provider pricing pages
 */
const PRICING: Record<
  string,
  Record<
    string,
    {
      prompt: number; // per 1M tokens
      completion: number; // per 1M tokens
    }
  >
> = {
  anthropic: {
    "claude-3-5-sonnet-20241022": {
      prompt: 3.0,
      completion: 15.0,
    },
    "claude-3-5-sonnet-20240620": {
      prompt: 3.0,
      completion: 15.0,
    },
    "claude-3-5-haiku-20241022": {
      prompt: 1.0,
      completion: 5.0,
    },
    "claude-3-opus-20240229": {
      prompt: 15.0,
      completion: 75.0,
    },
    "claude-3-sonnet-20240229": {
      prompt: 3.0,
      completion: 15.0,
    },
    "claude-3-haiku-20240307": {
      prompt: 0.25,
      completion: 1.25,
    },
  },
  openai: {
    "gpt-4o": {
      prompt: 2.5,
      completion: 10.0,
    },
    "gpt-4o-mini": {
      prompt: 0.15,
      completion: 0.6,
    },
    "gpt-4-turbo": {
      prompt: 10.0,
      completion: 30.0,
    },
    "gpt-4": {
      prompt: 30.0,
      completion: 60.0,
    },
    "gpt-3.5-turbo": {
      prompt: 0.5,
      completion: 1.5,
    },
  },
  google: {
    "gemini-2.0-flash-exp": {
      prompt: 0.0, // Free tier
      completion: 0.0,
    },
    "gemini-1.5-pro": {
      prompt: 1.25,
      completion: 5.0,
    },
    "gemini-1.5-flash": {
      prompt: 0.075,
      completion: 0.3,
    },
  },
};

/**
 * Estimate cost for a request
 */
export function estimateCost(
  provider: string,
  model: string,
  promptTokens: number,
  estimatedCompletionTokens: number,
): CostEstimate {
  const pricing = PRICING[provider]?.[model];
  
  if (!pricing) {
    // Unknown provider/model - use conservative estimate
    return {
      promptTokens,
      completionTokens: estimatedCompletionTokens,
      totalTokens: promptTokens + estimatedCompletionTokens,
      estimatedCost: 0.01, // $0.01 conservative estimate
      currency: "USD",
      provider,
      model,
      breakdown: {
        promptCost: 0.005,
        completionCost: 0.005,
      },
    };
  }
  
  const promptCost = (promptTokens / 1_000_000) * pricing.prompt;
  const completionCost = (estimatedCompletionTokens / 1_000_000) * pricing.completion;
  const estimatedCost = promptCost + completionCost;
  
  return {
    promptTokens,
    completionTokens: estimatedCompletionTokens,
    totalTokens: promptTokens + estimatedCompletionTokens,
    estimatedCost,
    currency: "USD",
    provider,
    model,
    breakdown: {
      promptCost,
      completionCost,
    },
  };
}

/**
 * Calculate actual cost from usage
 */
export function calculateActualCost(usage: TokenUsage, provider: string, model: string): number {
  const pricing = PRICING[provider]?.[model];
  
  if (!pricing) {
    return 0.01; // Conservative fallback
  }
  
  const promptCost = (usage.promptTokens / 1_000_000) * pricing.prompt;
  const completionCost = (usage.completionTokens / 1_000_000) * pricing.completion;
  
  return promptCost + completionCost;
}

/**
 * Format cost estimate for display
 */
export function formatCostEstimate(estimate: CostEstimate): string {
  if (estimate.estimatedCost < 0.001) {
    return "< $0.001";
  }
  if (estimate.estimatedCost < 0.01) {
    return `$${estimate.estimatedCost.toFixed(4)}`;
  }
  if (estimate.estimatedCost < 1) {
    return `$${estimate.estimatedCost.toFixed(3)}`;
  }
  return `$${estimate.estimatedCost.toFixed(2)}`;
}

/**
 * Estimate completion tokens based on prompt size
 * Rule of thumb: completions are usually 20-50% of prompt size
 */
export function estimateCompletionTokens(promptTokens: number): number {
  // Conservative estimate: 50% of prompt tokens
  return Math.ceil(promptTokens * 0.5);
}

/**
 * Calculate daily/weekly/monthly cost projections
 */
export function projectCosts(
  tokensPerDay: number,
  provider: string,
  model: string,
): {
  daily: number;
  weekly: number;
  monthly: number;
} {
  const estimate = estimateCost(provider, model, tokensPerDay, estimateCompletionTokens(tokensPerDay));
  
  return {
    daily: estimate.estimatedCost,
    weekly: estimate.estimatedCost * 7,
    monthly: estimate.estimatedCost * 30,
  };
}

/**
 * Check if cost exceeds warning threshold
 */
export function shouldWarnAboutCost(
  estimatedCost: number,
  threshold: number = 1.0, // $1 default
): boolean {
  return estimatedCost >= threshold;
}

/**
 * Get cost tier description
 */
export function getCostTier(cost: number): {
  tier: "free" | "low" | "medium" | "high" | "very-high";
  description: string;
} {
  if (cost < 0.01) {
    return {
      tier: "free",
      description: "Negligible cost",
    };
  }
  if (cost < 0.1) {
    return {
      tier: "low",
      description: "Low cost (~few cents)",
    };
  }
  if (cost < 1.0) {
    return {
      tier: "medium",
      description: "Medium cost (~$0.10-1.00)",
    };
  }
  if (cost < 10.0) {
    return {
      tier: "high",
      description: "High cost (~$1-10)",
    };
  }
  return {
    tier: "very-high",
    description: "⚠️ Very high cost (>$10)",
  };
}
