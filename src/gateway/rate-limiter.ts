export interface RateLimitEntry {
  count: number;
  resetAt: number;
  firstAttemptAt: number;
}

export class AuthRateLimiter {
  private attempts: Map<string, RateLimitEntry> = new Map();
  private readonly maxAttempts: number = 5;
  private readonly windowMs: number = 5 * 60 * 1000; // 5 minutes
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000) as unknown as NodeJS.Timeout;
  }

  /**
   * Check if IP is rate limited (and record failed attempt)
   * @param ip Client IP address
   * @returns allowed: false if rate limited, retryAfterSeconds if blocked
   */
  checkLimit(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
    const now = Date.now();
    const entry = this.attempts.get(ip);

    if (!entry) {
      // First attempt - allow but record
      this.attempts.set(ip, {
        count: 1,
        resetAt: now + this.windowMs,
        firstAttemptAt: now,
      });
      return { allowed: true };
    }

    if (now >= entry.resetAt) {
      // Window expired - reset
      this.attempts.delete(ip);
      this.attempts.set(ip, {
        count: 1,
        resetAt: now + this.windowMs,
        firstAttemptAt: now,
      });
      return { allowed: true };
    }

    // Within window - check limit
    if (entry.count >= this.maxAttempts) {
      const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
      return { allowed: false, retryAfterSeconds };
    }

    // Under limit - increment and allow
    entry.count += 1;
    return { allowed: true };
  }

  /**
   * Record successful authentication (resets rate limit for IP)
   * @param ip Client IP address
   */
  recordSuccess(ip: string): void {
    this.attempts.delete(ip);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [ip, entry] of this.attempts.entries()) {
      if (now >= entry.resetAt) {
        this.attempts.delete(ip);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.attempts.clear();
  }

  // For testing
  getAttempts(): Map<string, RateLimitEntry> {
    return new Map(this.attempts);
  }
}
