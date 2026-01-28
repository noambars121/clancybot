/**
 * Skill Dependency Scanner
 * 
 * Scans skill dependencies for security vulnerabilities:
 * - npm audit integration
 * - Typosquatting detection
 * - License compliance
 * - AI-BOM (Bill of Materials) generation
 * 
 * Addresses: Supply chain attacks via skill dependencies (Snyk research)
 * 
 * @module skills/dependency-scanner
 */

import { exec as execCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { log } from "../logging.js";

const exec = promisify(execCallback);

// ============================================================================
// Types
// ============================================================================

export type Vulnerability = {
  package: string;
  severity: "critical" | "high" | "moderate" | "low";
  title: string;
  description: string;
  cve?: string;
  url?: string;
  fixAvailable?: string;
};

export type DependencyRisk = {
  package: string;
  version: string;
  riskType: "typosquatting" | "suspicious-name" | "license" | "unmaintained";
  severity: "high" | "medium" | "low";
  reason: string;
  similarTo?: string;
};

export type DependencyInfo = {
  name: string;
  version: string;
  licenses?: string[];
  repository?: string;
  vulnerabilities?: Vulnerability[];
};

export type AIBOM = {
  skill: string;
  version: string;
  scanDate: string;
  dependencies: DependencyInfo[];
  totalDependencies: number;
  vulnerabilitiesFound: number;
  risksFound: number;
};

export type ScanResult = {
  safe: boolean;
  vulnerabilities: Vulnerability[];
  risks: DependencyRisk[];
  bom: AIBOM;
  summary: string;
};

// ============================================================================
// Popular Package Names (for typosquatting)
// ============================================================================

const POPULAR_PACKAGES = [
  // Core
  "react",
  "vue",
  "angular",
  "express",
  "axios",
  "lodash",
  "moment",
  "request",
  "chalk",
  "commander",
  "inquirer",
  // Build tools
  "webpack",
  "babel",
  "eslint",
  "prettier",
  "typescript",
  "rollup",
  "vite",
  // Testing
  "jest",
  "mocha",
  "chai",
  "vitest",
  "playwright",
  // AI/ML
  "@anthropic-ai/sdk",
  "openai",
  "langchain",
  "transformers",
  // Popular APIs
  "stripe",
  "twilio",
  "sendgrid",
  "aws-sdk",
  "google-cloud",
];

// ============================================================================
// String Similarity (Levenshtein)
// ============================================================================

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function similarityScore(a: string, b: string): number {
  const distance = levenshteinDistance(a, b);
  const maxLength = Math.max(a.length, b.length);
  return 1 - distance / maxLength;
}

function findSimilarPackages(packageName: string): string[] {
  const similar: string[] = [];

  for (const popular of POPULAR_PACKAGES) {
    const score = similarityScore(packageName, popular);
    
    // Similar but not exact (0.7-0.95 = likely typosquat)
    if (score > 0.7 && score < 0.95) {
      similar.push(popular);
    }
  }

  return similar;
}

// ============================================================================
// Package Analysis
// ============================================================================

/**
 * Check if package name is suspicious
 */
function checkPackageName(packageName: string): DependencyRisk | null {
  // Check for typosquatting
  const similar = findSimilarPackages(packageName);
  if (similar.length > 0) {
    return {
      package: packageName,
      version: "*",
      riskType: "typosquatting",
      severity: "high",
      reason: `Package name similar to: ${similar.join(", ")}. Possible typosquatting!`,
      similarTo: similar[0],
    };
  }

  // Check for suspicious patterns
  if (/^[a-z]{2,3}-[a-z]{2,3}-[a-z]{2,3}$/.test(packageName)) {
    return {
      package: packageName,
      version: "*",
      riskType: "suspicious-name",
      severity: "medium",
      reason: "Package name has suspicious pattern (random-looking words)",
    };
  }

  // Check for common malicious patterns
  if (/password|credential|token|secret|key|auth/i.test(packageName)) {
    return {
      package: packageName,
      version: "*",
      riskType: "suspicious-name",
      severity: "medium",
      reason: "Package name contains sensitive keywords (e.g., password, token)",
    };
  }

  return null;
}

// ============================================================================
// npm audit Integration
// ============================================================================

/**
 * Run npm audit in skill directory
 */
async function runNpmAudit(skillPath: string): Promise<Vulnerability[]> {
  try {
    const { stdout } = await exec("npm audit --json", { cwd: skillPath });
    const audit = JSON.parse(stdout);

    const vulnerabilities: Vulnerability[] = [];

    if (audit.vulnerabilities) {
      for (const [pkgName, vulnData] of Object.entries(audit.vulnerabilities)) {
        const data = vulnData as any;
        
        if (data.via && Array.isArray(data.via)) {
          for (const via of data.via) {
            if (typeof via === "object") {
              vulnerabilities.push({
                package: pkgName,
                severity: via.severity || "moderate",
                title: via.title || "Security vulnerability",
                description: via.url || "",
                cve: via.cve?.[0],
                url: via.url,
                fixAvailable: data.fixAvailable ? "Yes" : "No",
              });
            }
          }
        }
      }
    }

    return vulnerabilities;
  } catch (err) {
    log.warn("npm audit failed", { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

// ============================================================================
// Package.json Parsing
// ============================================================================

/**
 * Read and parse package.json
 */
async function readPackageJson(skillPath: string): Promise<any> {
  try {
    const content = await readFile(join(skillPath, "package.json"), "utf8");
    return JSON.parse(content);
  } catch (err) {
    throw new Error(`Failed to read package.json: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Extract dependency info from package.json
 */
function extractDependencies(packageJson: any): Array<{ name: string; version: string }> {
  const deps: Array<{ name: string; version: string }> = [];

  const allDeps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.peerDependencies,
  };

  for (const [name, version] of Object.entries(allDeps)) {
    deps.push({ name, version: String(version) });
  }

  return deps;
}

// ============================================================================
// AI-BOM Generation
// ============================================================================

/**
 * Generate AI Bill of Materials (SBOM for AI skills)
 */
function generateBOM(
  packageJson: any,
  dependencies: DependencyInfo[],
  vulnerabilities: Vulnerability[],
  risks: DependencyRisk[],
): AIBOM {
  return {
    skill: packageJson.name || "unknown",
    version: packageJson.version || "unknown",
    scanDate: new Date().toISOString(),
    dependencies,
    totalDependencies: dependencies.length,
    vulnerabilitiesFound: vulnerabilities.length,
    risksFound: risks.length,
  };
}

// ============================================================================
// Main Scanner
// ============================================================================

/**
 * Scan skill dependencies for vulnerabilities and risks
 */
export async function scanSkill(skillPath: string): Promise<ScanResult> {
  log.info("Scanning skill dependencies", { skillPath });

  // Read package.json
  const packageJson = await readPackageJson(skillPath);
  const deps = extractDependencies(packageJson);

  // Run npm audit
  const vulnerabilities = await runNpmAudit(skillPath);

  // Check for risks
  const risks: DependencyRisk[] = [];
  for (const dep of deps) {
    const risk = checkPackageName(dep.name);
    if (risk) {
      risk.version = dep.version;
      risks.push(risk);
    }
  }

  // Build dependency info
  const dependencyInfo: DependencyInfo[] = deps.map((dep) => ({
    name: dep.name,
    version: dep.version,
    // TODO: fetch licenses from npm registry
    vulnerabilities: vulnerabilities.filter((v) => v.package === dep.name),
  }));

  // Generate BOM
  const bom = generateBOM(packageJson, dependencyInfo, vulnerabilities, risks);

  // Determine safety
  const criticalVulns = vulnerabilities.filter((v) => v.severity === "critical").length;
  const highSeverityRisks = risks.filter((r) => r.severity === "high").length;
  const safe = criticalVulns === 0 && highSeverityRisks === 0 && vulnerabilities.length < 5;

  // Summary
  let summary = `Scanned ${deps.length} dependencies\n`;
  summary += `• Vulnerabilities: ${vulnerabilities.length} (${criticalVulns} critical)\n`;
  summary += `• Risks: ${risks.length} (${highSeverityRisks} high severity)\n`;
  summary += safe ? "✅ Safe to use" : "⚠️  Security issues found";

  log.info("Dependency scan complete", {
    skill: bom.skill,
    dependencies: deps.length,
    vulnerabilities: vulnerabilities.length,
    risks: risks.length,
    safe,
  });

  return {
    safe,
    vulnerabilities,
    risks,
    bom,
    summary,
  };
}

/**
 * Save AI-BOM to file
 */
export async function saveBOM(bom: AIBOM, outputPath: string): Promise<void> {
  const content = JSON.stringify(bom, null, 2);
  await import("node:fs/promises").then((fs) => fs.writeFile(outputPath, content));
  log.info("AI-BOM saved", { path: outputPath });
}

// ============================================================================
// Export
// ============================================================================

export const DependencyScanner = {
  scanSkill,
  saveBOM,
  checkPackageName,
  findSimilarPackages,
};
