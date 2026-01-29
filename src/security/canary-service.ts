/**
 * Canary Service - Backend monitoring service for canary tokens
 *
 * Runs as a lightweight HTTP server that:
 * 1. Receives requests to canary URLs (triggers)
 * 2. Logs access details (IP, user-agent, etc.)
 * 3. Returns fake data (to look legit to attacker)
 * 4. Provides API for checking trigger status
 *
 * @see Phase 9 - Pentagon+++ Security
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import { getChildLogger } from "../logging.js";
import type { CanaryAccess } from "./canary-tokens.js";

const log = getChildLogger("canary-service");

// ============================================================================
// Types
// ============================================================================

export type CanaryServiceConfig = {
  port: number;
  host: string;
  enabled: boolean;
};

type AccessLog = {
  canaryId: string;
  accesses: CanaryAccess[];
};

// ============================================================================
// Canary Service
// ============================================================================

export class CanaryService {
  private config: CanaryServiceConfig;
  private server?: ReturnType<typeof createServer>;
  private accessLogs: Map<string, CanaryAccess[]> = new Map();

  constructor(config: CanaryServiceConfig) {
    this.config = config;
  }

  /**
   * Start the canary service
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        return reject(new Error("Canary service already running"));
      }

      this.server = createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          log.error("Canary service request error", { error: err });
          this.sendError(res, 500, "Internal server error");
        });
      });

      this.server.on("error", (err) => {
        log.error("Canary service error", { error: err });
        reject(err);
      });

      this.server.listen(this.config.port, this.config.host, () => {
        log.info("🍯 Canary service started", {
          host: this.config.host,
          port: this.config.port,
          url: `http://${this.config.host}:${this.config.port}`,
        });
        resolve();
      });
    });
  }

  /**
   * Stop the canary service
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        return resolve();
      }

      this.server.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.server = undefined;
          log.info("Canary service stopped");
          resolve();
        }
      });
    });
  }

  /**
   * Handle incoming HTTP request
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const path = url.pathname;

    log.debug("Canary service request", { method: req.method, path });

    // Route requests
    if (path.startsWith("/alert/")) {
      // CANARY TRIGGERED! 🚨
      const canaryId = path.slice("/alert/".length);
      await this.handleAlert(canaryId, req, res);
    } else if (path.startsWith("/webhook/")) {
      // Webhook canary
      const canaryId = path.slice("/webhook/".length);
      await this.handleAlert(canaryId, req, res);
    } else if (path.startsWith("/api/") && path.endsWith("/data")) {
      // API canary
      const parts = path.split("/");
      const canaryId = parts[2]; // /api/{id}/data
      await this.handleAlert(canaryId, req, res);
    } else if (path.startsWith("/status/")) {
      // Status check (for monitoring)
      const canaryId = path.slice("/status/".length);
      await this.handleStatus(canaryId, req, res);
    } else if (path === "/health") {
      // Health check
      this.sendJson(res, 200, { status: "ok", service: "canary" });
    } else {
      // Unknown endpoint
      this.sendError(res, 404, "Not found");
    }
  }

  /**
   * Handle canary alert (triggered!)
   */
  private async handleAlert(
    canaryId: string,
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    // Extract access details
    const access: CanaryAccess = {
      timestamp: Date.now(),
      ip: this.getClientIP(req),
      userAgent: req.headers["user-agent"],
      method: req.method,
    };

    // Log access
    if (!this.accessLogs.has(canaryId)) {
      this.accessLogs.set(canaryId, []);
    }
    this.accessLogs.get(canaryId)!.push(access);

    log.error("🚨 CANARY TOKEN TRIGGERED!", {
      canaryId,
      ip: access.ip,
      userAgent: access.userAgent,
      method: access.method,
    });

    // Return fake data (make it look legit)
    const fakeData = this.generateFakeResponse(canaryId);
    this.sendJson(res, 200, fakeData);
  }

  /**
   * Handle status check request
   */
  private async handleStatus(
    canaryId: string,
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const accesses = this.accessLogs.get(canaryId) || [];

    this.sendJson(res, 200, {
      canaryId,
      triggered: accesses.length > 0,
      accesses,
      count: accesses.length,
    });
  }

  /**
   * Generate fake response data
   */
  private generateFakeResponse(canaryId: string): unknown {
    return {
      status: "ok",
      data: {
        id: canaryId,
        message: "Request processed successfully",
        timestamp: new Date().toISOString(),
        result: {
          success: true,
          code: 200,
          // Fake data that looks real
          items: [
            { id: 1, name: "item-1", value: "data-1" },
            { id: 2, name: "item-2", value: "data-2" },
          ],
        },
      },
    };
  }

  /**
   * Get client IP address
   */
  private getClientIP(req: IncomingMessage): string {
    // Check X-Forwarded-For (if behind proxy)
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return ips.split(",")[0].trim();
    }

    // Check X-Real-IP
    const realIp = req.headers["x-real-ip"];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    // Fallback to socket address
    return req.socket.remoteAddress || "unknown";
  }

  /**
   * Send JSON response
   */
  private sendJson(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  }

  /**
   * Send error response
   */
  private sendError(res: ServerResponse, status: number, message: string): void {
    this.sendJson(res, status, { error: message });
  }

  /**
   * Get all access logs
   */
  getAccessLogs(): Map<string, CanaryAccess[]> {
    return new Map(this.accessLogs);
  }

  /**
   * Get access logs for specific canary
   */
  getCanaryLogs(canaryId: string): CanaryAccess[] {
    return this.accessLogs.get(canaryId) || [];
  }

  /**
   * Clear access logs
   */
  clearLogs(): void {
    this.accessLogs.clear();
    log.info("Cleared canary access logs");
  }

  /**
   * Check if service is running
   */
  isRunning(): boolean {
    return this.server !== undefined;
  }
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_CANARY_SERVICE_CONFIG: CanaryServiceConfig = {
  port: 19999,
  host: "127.0.0.1", // Localhost only (security)
  enabled: false,
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Create and start canary service
 */
export async function startCanaryService(
  config: Partial<CanaryServiceConfig> = {}
): Promise<CanaryService> {
  const fullConfig = {
    ...DEFAULT_CANARY_SERVICE_CONFIG,
    ...config,
  };

  const service = new CanaryService(fullConfig);
  await service.start();
  return service;
}
