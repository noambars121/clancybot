# Phase 6: Final Security - 10/10 Coverage

**Goal:** Complete coverage of Chirag's 10 attack vectors  
**Status:** Planning  
**Target Score:** 100/100 Security (Pentagon++ level)

---

## 🎯 Remaining Vulnerabilities

### HACK #4: Browser Hijacking (Partial → Full)
**Current Status:** ⚠️ Partial (command validation only)  
**Missing:** Browser profile isolation validation  
**Priority:** HIGH  
**Effort:** 30 minutes

**Attack Vector:**
```
1. User gives bot browser access
2. Bot uses default Chrome profile (logged into everything)
3. Attacker asks: "Open Gmail, check for Apple reset code"
4. Bot opens authenticated Gmail
5. Attacker gets: 2FA codes, password resets
6. Attacker takes over: Apple ID, Google, 50+ accounts
```

**Solution:**
```typescript
// Prevent using default/authenticated browser profiles
if (profile === "default" || isAuthenticatedProfile(profile)) {
  throw new Error(
    "Security: Cannot use authenticated browser profile. " +
    "Create a separate, clean profile for Moltbot."
  );
}
```

---

### HACK #9: Skills Backdoor (None → Full)
**Current Status:** ❌ No protection  
**Missing:** Skills verification system  
**Priority:** CRITICAL  
**Effort:** 2-3 hours

**Attack Vector:**
```
1. Attacker publishes malicious skill to Clawdhub
2. Skill has backdoor code:
   - Exfiltrates credentials
   - Creates reverse shell
   - Installs rootkit
3. Victim installs skill (looks legitimate)
4. Bot executes backdoor on every run
5. Attacker gets: persistent access, all credentials
```

**Solution:**
```typescript
// Multi-layer verification
1. Signature verification (cryptographic)
2. Author allowlist (trusted publishers)
3. Code scanning (AST analysis)
4. Sandbox execution (isolated test)
5. Permission system (explicit user consent)
```

---

## 📋 Implementation Plan

### Task 1: Browser Profile Validation
**Files to Create:**
1. `src/browser/profile-validator.ts` - Core validation
2. `src/browser/profile-validator.test.ts` - Tests

**Files to Modify:**
1. `src/browser/pw-tools-core.interactions.ts` - Integration
2. `src/config/zod-schema.core.ts` - Config validation

**Validation Rules:**
- ❌ Block: "default", "Default", "Profile 1"
- ❌ Block: Profiles with active sessions
- ✅ Allow: Dedicated bot profiles only
- ✅ Check: Profile directory structure
- ✅ Verify: No cookies/sessions present

---

### Task 2: Skills Verification System
**Files to Create:**
1. `src/skills/verification.ts` - Main verification
2. `src/skills/signature.ts` - Signature validation
3. `src/skills/code-scanner.ts` - Static analysis
4. `src/skills/sandbox-tester.ts` - Isolated execution
5. `src/skills/permissions.ts` - Permission system
6. `src/skills/allowlist.ts` - Trusted authors
7. `src/skills/verification.test.ts` - Tests

**Files to Modify:**
1. `src/agents/skills.ts` - Integration
2. `src/config/types.base.ts` - Config types
3. `src/config/zod-schema.core.ts` - Schema

**Verification Layers:**

**Layer 1: Signature Verification**
```typescript
// Every skill must be signed
export async function verifySkillSignature(
  skillPath: string,
  publicKey: string
): Promise<boolean> {
  const signature = readSkillSignature(skillPath);
  const content = readSkillContent(skillPath);
  return crypto.verify("sha256", content, publicKey, signature);
}
```

**Layer 2: Author Allowlist**
```typescript
// Only trusted authors
const TRUSTED_AUTHORS = [
  "moltbot-official",
  "anthropic-verified",
  // User can add more
];

export function isAuthorTrusted(author: string): boolean {
  return TRUSTED_AUTHORS.includes(author);
}
```

**Layer 3: Code Scanner**
```typescript
// AST analysis for malicious patterns
const DANGEROUS_PATTERNS = [
  /eval\(/,
  /Function\(/,
  /child_process/,
  /\.exec\(/,
  /\.spawn\(/,
  /process\.env/,
  /require\(['"]fs['"]\)/,
  /fs\.readFileSync/,
  /fs\.writeFileSync/,
  /net\.connect/,
  /http\.request/,
];

export function scanSkillCode(code: string): string[] {
  const threats: string[] = [];
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      threats.push(`Dangerous pattern: ${pattern.source}`);
    }
  }
  return threats;
}
```

**Layer 4: Sandbox Execution**
```typescript
// Test skill in isolated environment
export async function testSkillInSandbox(
  skillPath: string
): Promise<{ safe: boolean; logs: string[] }> {
  const sandbox = createSkillSandbox({
    timeout: 5000,
    allowNetwork: false,
    allowFileSystem: false,
  });
  
  try {
    await sandbox.execute(skillPath);
    return { safe: true, logs: sandbox.getLogs() };
  } catch (err) {
    return { safe: false, logs: [String(err)] };
  }
}
```

**Layer 5: Permission System**
```typescript
// Explicit user consent
export interface SkillPermissions {
  network: boolean;      // Can access network?
  filesystem: boolean;   // Can read/write files?
  credentials: boolean;  // Can access credentials?
  shell: boolean;        // Can execute shell commands?
}

export async function requestSkillPermissions(
  skillName: string,
  permissions: SkillPermissions
): Promise<boolean> {
  // Show user consent dialog
  const approved = await showPermissionDialog({
    skill: skillName,
    permissions,
  });
  
  return approved;
}
```

---

## 🔧 Implementation Steps

### Step 1: Browser Profile Validation (30 min)
1. Create `profile-validator.ts` (15 min)
2. Add tests (10 min)
3. Integrate into browser tools (5 min)

### Step 2: Skills Verification (2-3 hours)
1. Signature verification (30 min)
2. Author allowlist (15 min)
3. Code scanner (45 min)
4. Sandbox tester (60 min)
5. Permission system (30 min)
6. Integration + tests (30 min)

**Total Time:** ~3.5 hours

---

## 📊 Expected Results

### Before Phase 6
```
Security Coverage: 8/10 (80%)
- ✅ Gateway auth
- ✅ DM policy
- ⚠️ Browser (partial)
- ⚠️ 1Password (partial)
- ✅ Slack tokens
- ✅ Sandbox
- ✅ Prompt injection
- ❌ Skills (none)
- ✅ Combined (mostly)

Security Score: 95/100
```

### After Phase 6
```
Security Coverage: 10/10 (100%)
- ✅ Gateway auth
- ✅ DM policy
- ✅ Browser (FULL)
- ✅ 1Password (FULL)
- ✅ Slack tokens
- ✅ Sandbox
- ✅ Prompt injection
- ✅ Skills (FULL)
- ✅ Combined (ALL)

Security Score: 100/100 (Pentagon++ level)
```

---

## ✅ Success Criteria

1. ✅ Browser profile validation implemented
2. ✅ Default/authenticated profiles blocked
3. ✅ Skills signature verification implemented
4. ✅ Skills code scanning implemented
5. ✅ Skills sandbox testing implemented
6. ✅ Skills permission system implemented
7. ✅ All tests passing
8. ✅ 10/10 Chirag attack vectors covered
9. ✅ Security score: 100/100

---

**Status:** Ready to implement  
**Priority:** CRITICAL  
**Effort:** ~3.5 hours total
