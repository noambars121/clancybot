/**
 * LLM Output Validator
 * 
 * Addresses OWASP LLM02: Insecure Output Handling
 * 
 * Validates all LLM outputs before execution to prevent:
 * - Command injection
 * - SQL injection
 * - Path traversal
 * - Arbitrary file operations
 * - Malicious tool use
 * 
 * @module security/output-validator
 */

import { log } from "../logging.js";

// ============================================================================
// Types
// ============================================================================

export type ValidationResult = {
  valid: boolean;
  reason?: string;
  sanitized?: unknown;
  threats?: string[];
};

export type ToolCallValidation = ValidationResult & {
  toolName: string;
  args: Record<string, unknown>;
};

// ============================================================================
// Dangerous Patterns
// ============================================================================

/**
 * Command injection patterns
 */
const COMMAND_INJECTION_PATTERNS = [
  /;\s*(rm|del|rmdir|format|mkfs)\s/i, // Destructive commands
  /\|\s*(curl|wget|nc|netcat)/i, // Data exfiltration
  /&&\s*(sudo|su|chmod|chown)/i, // Privilege escalation
  /`.*`/,  // Command substitution
  /\$\(.*\)/,  // Command substitution
  />\s*\/dev\/null/i, // Output redirection (hiding)
  /;\s*shutdown/i,
  /;\s*reboot/i,
];

/**
 * SQL injection patterns
 */
const SQL_INJECTION_PATTERNS = [
  /';\s*(DROP|DELETE|UPDATE|INSERT)/i,
  /\bOR\s+1\s*=\s*1/i,
  /\bUNION\s+SELECT/i,
  /--\s*$/,  // SQL comment
  /\/\*.*\*\//,  // SQL comment block
];

/**
 * Path traversal patterns
 */
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.(\/|\\)/,  // ../
  /~(\/|\\)/,  // ~/
  /\/(etc|var|sys|proc)/i,  // System directories
  /\\(windows|system32)/i,  // Windows system
];

/**
 * Sensitive file patterns
 */
const SENSITIVE_FILE_PATTERNS = [
  /\.(pem|key|p12|pfx)$/i,  // Private keys
  /_(rsa|dsa|ecdsa|ed25519)$/i,  // SSH keys
  /(password|passwd|shadow|credentials|secret|token|api[-_]?key)/i,
  /\/.ssh\//i,
  /\.aws\//i,
  /\.gnupg\//i,
];

/**
 * Data exfiltration patterns
 */
const EXFILTRATION_PATTERNS = [
  /https?:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0).*(\.txt|\.json|\.csv|\.log)/i,
  /curl.*-d.*@/i,
  /wget.*-O/i,
  /nc\s+\d+\.\d+\.\d+\.\d+/i,
];

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate a shell command
 */
export function validateCommand(command: string): ValidationResult {
  const threats: string[] = [];

  // Check for command injection
  for (const pattern of COMMAND_INJECTION_PATTERNS) {
    if (pattern.test(command)) {
      threats.push(`Command injection pattern detected: ${pattern.source}`);
    }
  }

  // Check for path traversal
  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (pattern.test(command)) {
      threats.push(`Path traversal pattern detected: ${pattern.source}`);
    }
  }

  // Check for exfiltration
  for (const pattern of EXFILTRATION_PATTERNS) {
    if (pattern.test(command)) {
      threats.push(`Data exfiltration pattern detected: ${pattern.source}`);
    }
  }

  if (threats.length > 0) {
    return {
      valid: false,
      reason: `Command contains suspicious patterns: ${threats.join(", ")}`,
      threats,
    };
  }

  return { valid: true };
}

/**
 * Validate a file path
 */
export function validatePath(path: string, operation: "read" | "write" | "delete"): ValidationResult {
  const threats: string[] = [];

  // Check for path traversal
  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (pattern.test(path)) {
      threats.push(`Path traversal detected: ${pattern.source}`);
    }
  }

  // Check for sensitive files (write/delete only)
  if (operation === "write" || operation === "delete") {
    for (const pattern of SENSITIVE_FILE_PATTERNS) {
      if (pattern.test(path)) {
        threats.push(`Sensitive file access: ${pattern.source}`);
      }
    }
  }

  if (threats.length > 0) {
    return {
      valid: false,
      reason: `Path contains suspicious patterns: ${threats.join(", ")}`,
      threats,
    };
  }

  return { valid: true };
}

/**
 * Validate SQL query
 */
export function validateSql(query: string): ValidationResult {
  const threats: string[] = [];

  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(query)) {
      threats.push(`SQL injection pattern detected: ${pattern.source}`);
    }
  }

  if (threats.length > 0) {
    return {
      valid: false,
      reason: `Query contains SQL injection patterns: ${threats.join(", ")}`,
      threats,
    };
  }

  return { valid: true };
}

/**
 * Validate URL/network request
 */
export function validateUrl(url: string): ValidationResult {
  const threats: string[] = [];

  try {
    const parsed = new URL(url);

    // Block file:// protocol
    if (parsed.protocol === "file:") {
      threats.push("file:// protocol not allowed");
    }

    // Warn on localhost (SSRF risk)
    if (
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "0.0.0.0" ||
      parsed.hostname.startsWith("169.254.") // AWS metadata
    ) {
      threats.push("Internal/localhost URL detected (SSRF risk)");
    }
  } catch (err) {
    threats.push("Invalid URL format");
  }

  if (threats.length > 0) {
    return {
      valid: false,
      reason: `URL validation failed: ${threats.join(", ")}`,
      threats,
    };
  }

  return { valid: true };
}

/**
 * Sanitize string (remove dangerous characters)
 */
export function sanitizeString(input: string, maxLength = 10000): string {
  // Truncate
  let sanitized = input.slice(0, maxLength);

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, "");

  // Remove ANSI escape codes (potential terminal injection)
  sanitized = sanitized.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");

  return sanitized;
}

// ============================================================================
// Tool Call Validation
// ============================================================================

/**
 * Validate tool call arguments
 */
export function validateToolCall(
  toolName: string,
  args: Record<string, unknown>,
): ToolCallValidation {
  const threats: string[] = [];

  // Validate exec tool
  if (toolName === "exec" || toolName === "process") {
    const command = typeof args.command === "string" ? args.command : "";
    const commandValidation = validateCommand(command);
    if (!commandValidation.valid) {
      return {
        toolName,
        args,
        valid: false,
        reason: commandValidation.reason,
        threats: commandValidation.threats,
      };
    }
  }

  // Validate file tools
  if (toolName === "read" || toolName === "write" || toolName === "delete" || toolName === "glob") {
    const path = typeof args.path === "string" ? args.path : "";
    const operation = toolName === "delete" ? "delete" : toolName === "write" ? "write" : "read";
    const pathValidation = validatePath(path, operation);
    if (!pathValidation.valid) {
      return {
        toolName,
        args,
        valid: false,
        reason: pathValidation.reason,
        threats: pathValidation.threats,
      };
    }
  }

  // Validate write content
  if (toolName === "write" && typeof args.content === "string") {
    const content = args.content;
    
    // Check for SQL injection in content
    const sqlValidation = validateSql(content);
    if (!sqlValidation.valid) {
      threats.push(...(sqlValidation.threats || []));
    }

    // Check for command injection in content
    const cmdValidation = validateCommand(content);
    if (!cmdValidation.valid) {
      threats.push(...(cmdValidation.threats || []));
    }
  }

  // Validate network tools
  if (toolName === "fetch" || toolName === "browser_navigate") {
    const url = typeof args.url === "string" ? args.url : "";
    const urlValidation = validateUrl(url);
    if (!urlValidation.valid) {
      return {
        toolName,
        args,
        valid: false,
        reason: urlValidation.reason,
        threats: urlValidation.threats,
      };
    }
  }

  // Validate message content
  if (toolName === "message_send" && typeof args.message === "string") {
    const message = args.message;
    
    // Check for injection in message content
    const sqlValidation = validateSql(message);
    if (!sqlValidation.valid) {
      threats.push(...(sqlValidation.threats || []));
    }
  }

  // Validate cron payload
  if (toolName === "cron_add" && args.payload) {
    const payload = args.payload as Record<string, unknown>;
    if (payload.kind === "agentTurn" && typeof payload.message === "string") {
      const message = payload.message;
      
      // Check for injection in cron message
      const sqlValidation = validateSql(message);
      if (!sqlValidation.valid) {
        threats.push(...(sqlValidation.threats || []));
      }

      const cmdValidation = validateCommand(message);
      if (!cmdValidation.valid) {
        threats.push(...(cmdValidation.threats || []));
      }
    }
  }

  if (threats.length > 0) {
    return {
      toolName,
      args,
      valid: false,
      reason: `Tool call validation failed: ${threats.join(", ")}`,
      threats,
    };
  }

  return { toolName, args, valid: true };
}

/**
 * Log validation result
 */
export function logValidation(
  toolName: string,
  validation: ValidationResult,
  context?: Record<string, unknown>,
) {
  if (!validation.valid) {
    log.warn("Output validation failed", {
      toolName,
      reason: validation.reason,
      threats: validation.threats,
      ...context,
    });
  } else {
    log.debug("Output validation passed", {
      toolName,
      ...context,
    });
  }
}

// ============================================================================
// Export
// ============================================================================

export const OutputValidator = {
  validateCommand,
  validatePath,
  validateSql,
  validateUrl,
  validateToolCall,
  sanitizeString,
  logValidation,
};
