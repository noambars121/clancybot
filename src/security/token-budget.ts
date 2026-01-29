/**
 * Token Budget System - Phase 3 Critical Fix
 * 
 * Prevents cost explosions by enforcing token usage limits.
 * Addresses user reports of $300 in 2 days, 180M tokens in week.
 * 
 * Features:
 * - Daily/weekly/monthly token budgets
 * - Usage warnings at 50%, 80%, 100%
 * - Hard limits (optional)
 * - Per-agent budgets
 * - Cost estimation
 */

import { getChildLogger } from "../logging/logger.js";

const log = getChildLogger({ module: "token-budget" });

export interface TokenBudgetConfig {
  enabled: boolean;
  
  // Budget limits
  dailyLimit?: number;
  weeklyLimit?: number;
  monthlyLimit?: number;
  
  // Warnings
  warningThresholds: number[]; // e.g. [0.5, 0.8, 1.0] for 50%, 80%, 100%
  
  // Hard limit behavior
  hardLimit: boolean; // If true, reject requests when budget exceeded
  
  // Per-agent budgets (optional)
  perAgent?: {
    [agentId: string]: {
      dailyLimit?: number;
      weeklyLimit?: number;
      monthlyLimit?: number;
    };
  };
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  timestamp: number;
  agentId?: string;
  provider?: string;
  model?: string;
}

export interface BudgetStatus {
  period: "daily" | "weekly" | "monthly";
  limit: number;
  used: number;
  remaining: number;
  percentUsed: number;
  exceeded: boolean;
}

export interface BudgetWarning {
  threshold: number; // 0.5, 0.8, 1.0
  status: BudgetStatus;
  message: string;
}

export class TokenBudgetManager {
  private config: TokenBudgetConfig;
  private usage: TokenUsage[] = [];
  private lastWarnings: Map<string, number> = new Map(); // Track last warning time per threshold
  
  constructor(config: TokenBudgetConfig) {
    this.config = config;
  }
  
  /**
   * Record token usage
   */
  recordUsage(usage: TokenUsage): void {
    if (!this.config.enabled) return;
    
    this.usage.push(usage);
    log.debug(
      `Token usage recorded: ${usage.totalTokens} tokens (${usage.provider || "unknown"}/${usage.model || "unknown"})`,
    );
    
    // Check budgets and issue warnings
    this.checkBudgets(usage.agentId);
    
    // Cleanup old usage (keep last 31 days)
    this.cleanupOldUsage();
  }
  
  /**
   * Check if request would exceed budget
   */
  async checkBudget(
    estimatedTokens: number,
    agentId?: string,
  ): Promise<{ allowed: boolean; warning?: BudgetWarning }> {
    if (!this.config.enabled) {
      return { allowed: true };
    }
    
    const statuses = this.getBudgetStatuses(agentId);
    
    for (const status of statuses) {
      const wouldExceed = status.used + estimatedTokens > status.limit;
      
      if (wouldExceed && this.config.hardLimit) {
        // Hard limit: reject
        return {
          allowed: false,
          warning: {
            threshold: 1.0,
            status,
            message: `Budget exceeded: ${status.used + estimatedTokens}/${status.limit} tokens (${status.period})`,
          },
        };
      }
      
      if (wouldExceed) {
        // Soft limit: warn but allow
        return {
          allowed: true,
          warning: {
            threshold: 1.0,
            status,
            message: `Warning: Request would exceed ${status.period} budget (${status.used + estimatedTokens}/${status.limit} tokens)`,
          },
        };
      }
    }
    
    return { allowed: true };
  }
  
  /**
   * Get budget status for all periods
   */
  getBudgetStatuses(agentId?: string): BudgetStatus[] {
    const statuses: BudgetStatus[] = [];
    
    // Get agent-specific limits if available
    const agentConfig = agentId && this.config.perAgent?.[agentId];
    const agentLimits = typeof agentConfig === 'object' ? agentConfig : undefined;
    
    if (this.config.dailyLimit || agentLimits?.dailyLimit) {
      statuses.push(
        this.calculateBudgetStatus(
          "daily",
          agentLimits?.dailyLimit || this.config.dailyLimit!,
          agentId,
        ),
      );
    }
    
    if (this.config.weeklyLimit || agentLimits?.weeklyLimit) {
      statuses.push(
        this.calculateBudgetStatus(
          "weekly",
          agentLimits?.weeklyLimit || this.config.weeklyLimit!,
          agentId,
        ),
      );
    }
    
    if (this.config.monthlyLimit || agentLimits?.monthlyLimit) {
      statuses.push(
        this.calculateBudgetStatus(
          "monthly",
          agentLimits?.monthlyLimit || this.config.monthlyLimit!,
          agentId,
        ),
      );
    }
    
    return statuses;
  }
  
  /**
   * Calculate budget status for a period
   */
  private calculateBudgetStatus(
    period: "daily" | "weekly" | "monthly",
    limit: number,
    agentId?: string,
  ): BudgetStatus {
    const used = this.getUsageForPeriod(period, agentId);
    const remaining = Math.max(0, limit - used);
    const percentUsed = (used / limit) * 100;
    const exceeded = used > limit;
    
    return {
      period,
      limit,
      used,
      remaining,
      percentUsed,
      exceeded,
    };
  }
  
  /**
   * Get usage for a specific period
   */
  private getUsageForPeriod(period: "daily" | "weekly" | "monthly", agentId?: string): number {
    const now = Date.now();
    const cutoff =
      period === "daily"
        ? now - 24 * 60 * 60 * 1000
        : period === "weekly"
          ? now - 7 * 24 * 60 * 60 * 1000
          : now - 30 * 24 * 60 * 60 * 1000;
    
    return this.usage
      .filter((u) => u.timestamp >= cutoff)
      .filter((u) => !agentId || u.agentId === agentId)
      .reduce((sum, u) => sum + u.totalTokens, 0);
  }
  
  /**
   * Check budgets and issue warnings
   */
  private checkBudgets(agentId?: string): void {
    const statuses = this.getBudgetStatuses(agentId);
    
    for (const status of statuses) {
      // Check each threshold
      for (const threshold of this.config.warningThresholds) {
        if (status.percentUsed / 100 >= threshold) {
          this.issueWarning(threshold, status, agentId);
        }
      }
    }
  }
  
  /**
   * Issue a warning (rate-limited to once per hour per threshold)
   */
  private issueWarning(threshold: number, status: BudgetStatus, agentId?: string): void {
    const key = `${agentId || "global"}-${status.period}-${threshold}`;
    const lastWarning = this.lastWarnings.get(key) || 0;
    const now = Date.now();
    
    // Rate limit: once per hour
    if (now - lastWarning < 60 * 60 * 1000) {
      return;
    }
    
    this.lastWarnings.set(key, now);
    
    const message =
      threshold >= 1.0
        ? `🚨 Budget EXCEEDED: ${status.used}/${status.limit} tokens (${status.period})`
        : `⚠️ Budget warning (${Math.round(threshold * 100)}%): ${status.used}/${status.limit} tokens (${status.period})`;
    
    log.warn(message);
    
    // TODO: Send notification to user (e.g. via control channel)
  }
  
  /**
   * Cleanup old usage records (keep last 31 days)
   */
  private cleanupOldUsage(): void {
    const cutoff = Date.now() - 31 * 24 * 60 * 60 * 1000;
    this.usage = this.usage.filter((u) => u.timestamp >= cutoff);
  }
  
  /**
   * Get usage summary
   */
  getSummary(agentId?: string): {
    daily: BudgetStatus | null;
    weekly: BudgetStatus | null;
    monthly: BudgetStatus | null;
  } {
    const statuses = this.getBudgetStatuses(agentId);
    return {
      daily: statuses.find((s) => s.period === "daily") || null,
      weekly: statuses.find((s) => s.period === "weekly") || null,
      monthly: statuses.find((s) => s.period === "monthly") || null,
    };
  }
}

/**
 * Default budget configuration
 */
export const DEFAULT_BUDGET_CONFIG: TokenBudgetConfig = {
  enabled: true,
  dailyLimit: 200_000, // 200k tokens/day (~$1-3/day on Claude)
  weeklyLimit: 1_000_000, // 1M tokens/week
  monthlyLimit: 4_000_000, // 4M tokens/month (~$60-120/month)
  warningThresholds: [0.5, 0.8, 1.0], // 50%, 80%, 100%
  hardLimit: false, // Warn but don't block
};
