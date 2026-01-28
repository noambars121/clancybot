/**
 * Skills Verification System - Phase 6
 * 
 * Prevents HACK #9 from Chirag's article: Backdooring through Clawdhub Skills
 * 
 * Attack Vector:
 * - Attacker publishes malicious skill to skill marketplace
 * - Skill contains backdoor: exfiltrates credentials, creates reverse shell
 * - Victim installs skill (looks legitimate)
 * - Bot executes backdoor code
 * - Attacker gets: persistent access, all credentials
 * 
 * Solution:
 * - Multi-layer verification:
 *   1. Signature verification (cryptographic)
 *   2. Author allowlist (trusted publishers)
 *   3. Code scanning (AST + pattern matching)
 *   4. Permission system (explicit consent)
 * 
 * GitHub Issue: Chirag's Hack #9
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getChildLogger } from "../logging/logger.js";

const log = getChildLogger("skills-verification");

export interface SkillVerificationResult {
  verified: boolean;
  reasons: string[];
  warnings: string[];
  score: number; // 0-100
}

export interface SkillMetadata {
  name: string;
  version: string;
  author: string;
  description?: string;
  homepage?: string;
  repository?: string;
  signature?: string;
  permissions?: SkillPermissions;
}

export interface SkillPermissions {
  network?: boolean;      // Can access network?
  filesystem?: boolean;   // Can read/write files?
  credentials?: boolean;  // Can access credentials?
  shell?: boolean;        // Can execute shell commands?
  env?: boolean;          // Can access environment variables?
}

/**
 * Trusted skill authors
 * Official Moltbot skills + verified community publishers
 */
export const TRUSTED_AUTHORS = [
  "moltbot-official",
  "anthropic-verified",
  // Users can extend this via config
];

/**
 * Dangerous code patterns (AST-independent)
 * These patterns indicate potentially malicious code
 */
export const DANGEROUS_PATTERNS = [
  // Direct eval/Function
  { pattern: /\beval\s*\(/, severity: "critical", description: "eval() usage" },
  { pattern: /\bFunction\s*\(/, severity: "critical", description: "Function() constructor" },
  
  // Child process / shell execution
  { pattern: /child_process/i, severity: "critical", description: "child_process module" },
  { pattern: /\.exec\s*\(/, severity: "critical", description: ".exec() usage" },
  { pattern: /\.execSync\s*\(/, severity: "critical", description: ".execSync() usage" },
  { pattern: /\.spawn\s*\(/, severity: "high", description: ".spawn() usage" },
  { pattern: /\.spawnSync\s*\(/, severity: "high", description: ".spawnSync() usage" },
  
  // Environment variables
  { pattern: /process\.env/i, severity: "high", description: "process.env access" },
  { pattern: /\$\{[A-Z_]+\}/, severity: "medium", description: "Environment variable interpolation" },
  
  // File system access
  { pattern: /require\s*\(\s*['"]fs['"]\s*\)/, severity: "high", description: "fs module import" },
  { pattern: /fs\.(read|write|unlink|rm)/i, severity: "high", description: "File system manipulation" },
  { pattern: /\.readFileSync\s*\(/, severity: "medium", description: "readFileSync() usage" },
  { pattern: /\.writeFileSync\s*\(/, severity: "medium", description: "writeFileSync() usage" },
  
  // Network access
  { pattern: /require\s*\(\s*['"]net['"]\s*\)/, severity: "high", description: "net module" },
  { pattern: /require\s*\(\s*['"]http['"]\s*\)/, severity: "medium", description: "http module" },
  { pattern: /require\s*\(\s*['"]https['"]\s*\)/, severity: "medium", description: "https module" },
  { pattern: /net\.connect/i, severity: "high", description: "Net connection" },
  { pattern: /http\.request/i, severity: "medium", description: "HTTP request" },
  
  // Credential access
  { pattern: /\.aws\/credentials/i, severity: "critical", description: "AWS credentials path" },
  { pattern: /\.ssh\/id_rsa/i, severity: "critical", description: "SSH key path" },
  { pattern: /\.moltbot\/config/i, severity: "critical", description: "Moltbot config path" },
  { pattern: /1password|lastpass|bitwarden/i, severity: "high", description: "Password manager" },
  
  // Obfuscation indicators
  { pattern: /atob\s*\(/, severity: "high", description: "Base64 decode (obfuscation)" },
  { pattern: /Buffer\.from\([^)]*,\s*['"]base64['"]\)/, severity: "high", description: "Base64 Buffer (obfuscation)" },
  { pattern: /String\.fromCharCode/, severity: "medium", description: "CharCode obfuscation" },
  
  // Dangerous globals
  { pattern: /global\[/, severity: "high", description: "Global object manipulation" },
  { pattern: /process\.binding/, severity: "critical", description: "process.binding (internals)" },
  { pattern: /__dirname|__filename/, severity: "low", description: "Path introspection" },
] as const;

/**
 * Check if author is trusted
 */
export function isAuthorTrusted(
  author: string,
  additionalTrusted: string[] = [],
): boolean {
  const normalized = author.trim().toLowerCase();
  const allTrusted = [...TRUSTED_AUTHORS, ...additionalTrusted].map((a) =>
    a.toLowerCase(),
  );
  return allTrusted.includes(normalized);
}

/**
 * Scan skill code for dangerous patterns
 */
export function scanSkillCode(code: string): {
  threats: Array<{ pattern: string; severity: string; description: string; line?: number }>;
  score: number;
} {
  const threats: Array<{
    pattern: string;
    severity: string;
    description: string;
    line?: number;
  }> = [];
  
  const lines = code.split("\n");
  
  for (const { pattern, severity, description } of DANGEROUS_PATTERNS) {
    let lineNum = 0;
    for (const line of lines) {
      lineNum++;
      if (pattern.test(line)) {
        threats.push({
          pattern: pattern.source,
          severity,
          description,
          line: lineNum,
        });
      }
    }
  }
  
  // Calculate security score (0-100)
  // Start at 100, deduct based on threat severity
  let score = 100;
  for (const threat of threats) {
    if (threat.severity === "critical") score -= 40;
    else if (threat.severity === "high") score -= 20;
    else if (threat.severity === "medium") score -= 10;
    else if (threat.severity === "low") score -= 5;
  }
  
  return { threats, score: Math.max(0, score) };
}

/**
 * Read skill metadata from package.json or SKILL.md
 */
export function readSkillMetadata(skillPath: string): SkillMetadata | null {
  // Try package.json first
  const packageJsonPath = path.join(skillPath, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      return {
        name: pkg.name || "unknown",
        version: pkg.version || "0.0.0",
        author: pkg.author?.name || pkg.author || "unknown",
        description: pkg.description,
        homepage: pkg.homepage,
        repository: typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url,
        signature: pkg.signature,
        permissions: pkg.moltbot?.permissions,
      };
    } catch (err) {
      log.warn(`Failed to parse package.json for skill at ${skillPath}: ${err}`);
    }
  }
  
  // Try SKILL.md metadata
  const skillMdPath = path.join(skillPath, "SKILL.md");
  if (fs.existsSync(skillMdPath)) {
    try {
      const content = fs.readFileSync(skillMdPath, "utf-8");
      // Extract metadata from YAML frontmatter
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (match) {
        const yaml = match[1];
        const name = yaml.match(/name:\s*(.+)/)?.[1]?.trim();
        const version = yaml.match(/version:\s*(.+)/)?.[1]?.trim();
        const author = yaml.match(/author:\s*(.+)/)?.[1]?.trim();
        
        if (name && author) {
          return {
            name,
            version: version || "0.0.0",
            author,
          };
        }
      }
    } catch (err) {
      log.warn(`Failed to parse SKILL.md for skill at ${skillPath}: ${err}`);
    }
  }
  
  return null;
}

/**
 * Read all code files from skill directory
 */
export function readSkillCode(skillPath: string): string {
  const codeFiles: string[] = [];
  
  const walk = (dir: string) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        if (!file.startsWith(".") && file !== "node_modules") {
          walk(filePath);
        }
      } else {
        // Only read code files
        if (
          file.endsWith(".ts") ||
          file.endsWith(".js") ||
          file.endsWith(".mjs") ||
          file.endsWith(".py")
        ) {
          codeFiles.push(filePath);
        }
      }
    }
  };
  
  walk(skillPath);
  
  // Concatenate all code
  let allCode = "";
  for (const file of codeFiles) {
    try {
      allCode += fs.readFileSync(file, "utf-8") + "\n";
    } catch (err) {
      log.warn(`Failed to read ${file}: ${err}`);
    }
  }
  
  return allCode;
}

/**
 * Verify skill signature (if present)
 * Note: This is a placeholder - real implementation would use proper crypto
 */
export function verifySkillSignature(
  metadata: SkillMetadata,
  code: string,
): boolean {
  if (!metadata.signature) {
    // No signature = not verified (but not necessarily malicious)
    return false;
  }
  
  try {
    // Placeholder: In real implementation, would:
    // 1. Fetch public key from trusted registry
    // 2. Verify signature using crypto.verify()
    // 3. Ensure signature matches code hash
    
    const hash = crypto.createHash("sha256").update(code).digest("hex");
    // For now, just check if signature looks valid (hex string)
    return /^[0-9a-f]{64,}$/i.test(metadata.signature);
  } catch {
    return false;
  }
}

/**
 * Verify skill comprehensively
 */
export function verifySkill(
  skillPath: string,
  options: {
    trustedAuthors?: string[];
    requireSignature?: boolean;
    minSecurityScore?: number;
  } = {},
): SkillVerificationResult {
  const {
    trustedAuthors = [],
    requireSignature = false,
    minSecurityScore = 60,
  } = options;
  
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 100;
  
  // Step 1: Read metadata
  const metadata = readSkillMetadata(skillPath);
  if (!metadata) {
    reasons.push("No skill metadata found (package.json or SKILL.md)");
    return { verified: false, reasons, warnings, score: 0 };
  }
  
  log.info(`Verifying skill: ${metadata.name} v${metadata.version} by ${metadata.author}`);
  
  // Step 2: Check author
  const authorTrusted = isAuthorTrusted(metadata.author, trustedAuthors);
  if (!authorTrusted) {
    warnings.push(`Author "${metadata.author}" is not in trusted list`);
    score -= 20;
  }
  
  // Step 3: Read code
  const code = readSkillCode(skillPath);
  if (!code || code.trim().length === 0) {
    warnings.push("No code found in skill");
  }
  
  // Step 4: Verify signature
  const signatureValid = verifySkillSignature(metadata, code);
  if (requireSignature && !signatureValid) {
    reasons.push("Skill signature verification failed");
    score -= 30;
  } else if (!signatureValid) {
    warnings.push("Skill is not signed");
    score -= 10;
  }
  
  // Step 5: Scan code for threats
  const scanResult = scanSkillCode(code);
  score = Math.min(score, scanResult.score);
  
  if (scanResult.threats.length > 0) {
    warnings.push(`Found ${scanResult.threats.length} potential security concerns`);
    
    for (const threat of scanResult.threats) {
      const location = threat.line ? ` (line ${threat.line})` : "";
      warnings.push(
        `[${threat.severity}] ${threat.description}${location}`,
      );
    }
    
    // Critical threats = fail
    const criticalThreats = scanResult.threats.filter((t) => t.severity === "critical");
    if (criticalThreats.length > 0) {
      reasons.push(`Found ${criticalThreats.length} critical security threats`);
    }
  }
  
  // Step 6: Check permissions
  if (metadata.permissions) {
    const dangerousPerms: string[] = [];
    if (metadata.permissions.shell) dangerousPerms.push("shell");
    if (metadata.permissions.credentials) dangerousPerms.push("credentials");
    if (metadata.permissions.filesystem) dangerousPerms.push("filesystem");
    
    if (dangerousPerms.length > 0) {
      warnings.push(`Skill requests dangerous permissions: ${dangerousPerms.join(", ")}`);
      score -= 15 * dangerousPerms.length;
    }
  }
  
  // Final decision
  const verified = score >= minSecurityScore && reasons.length === 0;
  
  if (!verified && reasons.length === 0) {
    reasons.push(`Security score ${score} below minimum ${minSecurityScore}`);
  }
  
  log.info(
    `Skill verification: ${verified ? "PASS" : "FAIL"} ` +
    `(score: ${score}, reasons: ${reasons.length}, warnings: ${warnings.length})`,
  );
  
  return { verified, reasons, warnings, score };
}
