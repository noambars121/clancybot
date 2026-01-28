/**
 * Token expiration utilities for Phase 2 session management
 */

export interface TokenMetadata {
  token: string;
  createdAt: number; // Unix timestamp (ms)
  expiresAt: number; // Unix timestamp (ms)
  rotatedAt?: number; // Unix timestamp (ms)
  deviceId?: string;
}

/**
 * Check if a token has expired
 */
export function isTokenExpired(metadata: TokenMetadata): boolean {
  const now = Date.now();
  return now >= metadata.expiresAt;
}

/**
 * Get remaining TTL in seconds (or negative if expired)
 */
export function getTokenTtlSeconds(metadata: TokenMetadata): number {
  const now = Date.now();
  const remainingMs = metadata.expiresAt - now;
  return Math.floor(remainingMs / 1000);
}

/**
 * Check if token should be rotated (approaching expiry)
 */
export function shouldRotateToken(
  metadata: TokenMetadata,
  rotateBeforeExpirySec: number,
): boolean {
  const ttlSec = getTokenTtlSeconds(metadata);
  return ttlSec <= rotateBeforeExpirySec && ttlSec > 0;
}

/**
 * Calculate expiration timestamp from TTL hours
 */
export function calculateExpiration(ttlHours: number): number {
  return Date.now() + ttlHours * 60 * 60 * 1000;
}

/**
 * Format token expiration for human display
 */
export function formatTokenExpiry(metadata: TokenMetadata): string {
  const ttlSec = getTokenTtlSeconds(metadata);
  
  if (ttlSec <= 0) {
    return "expired";
  }
  
  const hours = Math.floor(ttlSec / 3600);
  const minutes = Math.floor((ttlSec % 3600) / 60);
  const seconds = ttlSec % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}
