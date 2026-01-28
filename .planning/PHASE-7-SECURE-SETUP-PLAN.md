# Phase 7B: Secure-by-Default Setup

**Goal:** Make security easy - one command to secure setup  
**Philosophy:** Secure by default, easy to use, beautiful UI

---

## 🎯 Vision

```bash
# Current (complex, error-prone):
npm install -g moltbot
moltbot config set gateway.auth.token "random-token-here"
moltbot config set channels.discord.dmPolicy "pairing"
moltbot config set agents.defaults.sandbox.mode "non-main"
moltbot security audit
moltbot security migrate
# ... 20 more commands

# New (one command, auto-secure):
moltbot setup --secure
```

**Result:**
- ✅ All security defaults applied
- ✅ Secrets encrypted
- ✅ Sandbox enabled
- ✅ Auth configured
- ✅ DM policy set to pairing
- ✅ Browser profile validated
- ✅ Skills verification enabled
- ✅ Rate limiting active
- ✅ Logging enabled
- ✅ Security score: 100/100

---

## 🚀 Setup Flow

### Step 1: Interactive Security Wizard

```typescript
// moltbot setup --secure

┌─────────────────────────────────────────────┐
│  🔒 Moltbot Secure Setup Wizard            │
│  Pentagon-level security in 5 minutes      │
└─────────────────────────────────────────────┘

┌─ Step 1/5: Authentication ─────────────────┐
│                                             │
│  Gateway authentication protects your bot  │
│  from unauthorized access.                 │
│                                             │
│  Generate secure token? [Y/n]: Y           │
│                                             │
│  ✅ Generated: sk-molt-a1b2c3d4e5f6...    │
│  📋 Copied to clipboard                    │
│                                             │
│  Save to .env file? [Y/n]: Y               │
│  ✅ Saved to ~/.moltbot/.env              │
│                                             │
└─────────────────────────────────────────────┘

┌─ Step 2/5: Channel Security ───────────────┐
│                                             │
│  DM Policy controls who can message your   │
│  bot directly.                             │
│                                             │
│  Recommended: pairing (requires approval)  │
│                                             │
│  ○ disabled - No direct messages           │
│  ● pairing  - Requires approval (secure)   │
│  ○ allowlist - Only approved users         │
│                                             │
│  [Enter] to continue                       │
│                                             │
└─────────────────────────────────────────────┘

┌─ Step 3/5: Sandbox Protection ─────────────┐
│                                             │
│  Sandbox isolates bot execution for        │
│  maximum security.                         │
│                                             │
│  Enable Docker sandbox? [Y/n]: Y           │
│                                             │
│  ✅ Mode: non-main (Docker isolation)     │
│  ✅ Read-only filesystem                  │
│  ✅ No privileged mode                    │
│  ✅ Capabilities dropped                  │
│                                             │
└─────────────────────────────────────────────┘

┌─ Step 4/5: Browser Safety ─────────────────┐
│                                             │
│  Browser profile validation prevents       │
│  account hijacking.                        │
│                                             │
│  Current profile: "Default" ❌            │
│                                             │
│  ⚠️  Default profile is insecure!         │
│  Create dedicated profile for bot?         │
│                                             │
│  [Y] Create new profile                    │
│  [N] I'll do it manually                   │
│                                             │
│  → Opening chrome://settings/manageProfile │
│                                             │
│  Enter new profile name: moltbot-bot       │
│  ✅ Profile validated: "moltbot-bot"      │
│                                             │
└─────────────────────────────────────────────┘

┌─ Step 5/5: Final Checks ───────────────────┐
│                                             │
│  Running security checks...                │
│                                             │
│  ✅ Authentication: Enabled                │
│  ✅ DM Policy: Pairing                     │
│  ✅ Sandbox: Enabled (Docker)              │
│  ✅ Browser: Validated                     │
│  ✅ Secrets: Encrypted (AES-256-GCM)       │
│  ✅ Skills: Verification enabled           │
│  ✅ Rate Limiting: Active                  │
│  ✅ Logging: Enabled                       │
│                                             │
│  Security Score: 100/100 🏆                │
│                                             │
└─────────────────────────────────────────────┘

┌─ Setup Complete! ──────────────────────────┐
│                                             │
│  🎉 Your bot is now Pentagon-level secure! │
│                                             │
│  Next steps:                               │
│  1. Run: moltbot gateway start             │
│  2. Connect channels: moltbot channels add │
│  3. View dashboard: http://localhost:18789 │
│                                             │
│  💡 Tip: Run 'moltbot security audit'     │
│     anytime to check your security score   │
│                                             │
└─────────────────────────────────────────────┘
```

---

### Step 2: Secure Defaults (Auto-Applied)

```typescript
// src/config/secure-defaults.ts

export const SECURE_DEFAULTS: MoltbotConfig = {
  gateway: {
    bind: "loopback",  // localhost only
    port: 18789,
    auth: {
      enabled: true,
      token: generateSecureToken(),  // Auto-generated
    },
    rateLimit: {
      enabled: true,
      maxAttempts: 5,
      windowMs: 300000,  // 5 minutes
    },
  },
  
  channels: {
    // All channels: pairing by default
    "*": {
      dmPolicy: "pairing",  // Requires approval
      groupPolicy: "mention",  // Must be mentioned
    },
  },
  
  agents: {
    defaults: {
      sandbox: {
        mode: "non-main",  // Docker isolation
        docker: {
          privileged: false,
          readOnlyRootFilesystem: true,
          capDrop: ["ALL"],
          seccomp: "default",
          apparmor: "default",
        },
      },
      
      // Token budgets
      contextTokens: 100_000,  // Limit context
      maxTokensPerRequest: 10_000,
      
      // Cost controls
      costBudget: {
        enabled: true,
        dailyLimit: 10.00,  // $10/day max
        warningThreshold: 0.80,
      },
    },
  },
  
  security: {
    secrets: {
      encryption: "aes-256-gcm",  // Encrypt at rest
    },
    
    logging: {
      redactSensitive: true,  // Redact secrets in logs
      auditEnabled: true,
    },
    
    browser: {
      profileValidation: true,  // Validate profiles
      blockDefaultProfile: true,
    },
    
    skills: {
      verification: true,  // Verify skills
      minSecurityScore: 70,
      requireSignature: false,  // Future: enable
    },
    
    output: {
      validation: true,  // Validate LLM outputs
      sanitization: true,
    },
    
    network: {
      ssrfProtection: true,  // Block internal IPs
      allowedHosts: [],  // Allowlist only
    },
  },
  
  logging: {
    level: "info",
    security: {
      enabled: true,
      logAuth: true,
      logToolUse: true,
      logFileAccess: true,
      logConfigChanges: true,
    },
  },
};
```

---

### Step 3: Setup Validation

```typescript
// After setup, validate everything

export async function validateSecureSetup(): Promise<{
  score: number;
  issues: string[];
  warnings: string[];
}> {
  const issues: string[] = [];
  const warnings: string[] = [];
  let score = 100;
  
  // Check 1: Gateway auth
  if (!config.gateway?.auth?.enabled) {
    issues.push("Gateway authentication disabled");
    score -= 20;
  }
  
  // Check 2: DM policy
  if (config.channels?.["*"]?.dmPolicy === "open") {
    issues.push("DM policy is 'open' (insecure)");
    score -= 15;
  }
  
  // Check 3: Sandbox
  if (config.agents?.defaults?.sandbox?.mode === "main") {
    issues.push("Sandbox disabled (mode: main)");
    score -= 20;
  }
  
  // Check 4: Browser profile
  if (config.browser?.profile === "default") {
    issues.push("Using default browser profile");
    score -= 15;
  }
  
  // Check 5: Secrets encryption
  if (!config.security?.secrets?.encryption) {
    issues.push("Secrets not encrypted");
    score -= 15;
  }
  
  // Check 6: Skills verification
  if (!config.security?.skills?.verification) {
    warnings.push("Skills verification disabled");
    score -= 5;
  }
  
  // Check 7: Rate limiting
  if (!config.gateway?.rateLimit?.enabled) {
    warnings.push("Rate limiting disabled");
    score -= 5;
  }
  
  return { score, issues, warnings };
}
```

---

## 🎨 Beautiful UI (Security Dashboard)

### Dashboard Design

```typescript
// http://localhost:18789/security

┌─────────────────────────────────────────────────────────────┐
│  🔒 Moltbot Security Dashboard                              │
│  Last updated: 2026-01-27 14:30:00                          │
└─────────────────────────────────────────────────────────────┘

┌─ Security Score ────────────────────────────────────────────┐
│                                                              │
│           ┌───────────────────────────┐                     │
│           │                           │                     │
│           │        100/100            │                     │
│           │     🏆 Pentagon++         │                     │
│           │                           │                     │
│           │     ████████████████      │                     │
│           │                           │                     │
│           └───────────────────────────┘                     │
│                                                              │
│  ✅ All security checks passed                              │
│  ✅ 10/10 Chirag attacks prevented                          │
│  ✅ 9/9 OWASP/LLM issues addressed                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘

┌─ Real-Time Monitoring ──────────────────────────────────────┐
│                                                              │
│  🟢 Gateway: Running (secure)                               │
│  🟢 Auth: 245 requests authenticated today                  │
│  🟢 Rate Limit: 0 blocked attempts                          │
│  🟢 Sandbox: Active (Docker isolation)                      │
│  🟢 Skills: 12 verified, 0 blocked                          │
│                                                              │
│  Last 24 hours:                                             │
│  📊 Requests: 1,245                                         │
│  ✅ Authorized: 1,245 (100%)                                │
│  ❌ Blocked: 0                                              │
│  ⚠️  Warnings: 2 (low severity)                            │
│                                                              │
└──────────────────────────────────────────────────────────────┘

┌─ Security Checks ───────────────────────────────────────────┐
│                                                              │
│  ✅ Authentication          Enabled                         │
│  ✅ DM Policy               Pairing (secure)                │
│  ✅ Sandbox                 Docker (non-main)               │
│  ✅ Browser Profile         Validated (moltbot-bot)         │
│  ✅ Secrets                 Encrypted (AES-256-GCM)         │
│  ✅ Skills Verification     Enabled (score >= 70)           │
│  ✅ Rate Limiting           5 attempts / 5 min              │
│  ✅ Prompt Injection        15 patterns blocked             │
│  ✅ Output Validation       Enabled                         │
│  ✅ SSRF Protection         Enabled                         │
│                                                              │
│  [View Details] [Run Full Audit]                           │
│                                                              │
└──────────────────────────────────────────────────────────────┘

┌─ Recent Security Events ────────────────────────────────────┐
│                                                              │
│  14:25:12  ✅  Auth success (IP: 127.0.0.1)                │
│  14:20:45  ⚠️   Browser profile warning: large cookies     │
│  14:15:33  ✅  Skill verified: gmail-summarizer            │
│  14:10:22  ✅  Cron job created (validated)                │
│  14:05:11  ✅  Config change: updated rate limit           │
│                                                              │
│  [View Full Log] [Export Audit Trail]                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘

┌─ Quick Actions ─────────────────────────────────────────────┐
│                                                              │
│  🔄 Run Security Audit                                      │
│  ⚙️  Configure Security Settings                            │
│  📊 View Detailed Reports                                   │
│  🔐 Manage Access Control                                   │
│  📝 Review Audit Logs                                       │
│  🎯 Security Recommendations                                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 📦 Implementation Files

### Setup Wizard
1. `src/commands/setup/wizard.ts` - Interactive wizard
2. `src/commands/setup/secure-defaults.ts` - Default configs
3. `src/commands/setup/validation.ts` - Setup validation

### Security Dashboard
4. `src/gateway/ui/security-dashboard.ts` - Dashboard backend
5. `ui/security-dashboard.html` - Dashboard frontend
6. `ui/security-dashboard.css` - Styles
7. `ui/security-dashboard.js` - Interactive JS

### CLI Commands
8. `src/commands/security-score.ts` - Show security score
9. `src/commands/security-check.ts` - Run security checks

---

## ✅ Success Metrics

**Setup Time:**
- Before: 30+ minutes (manual config)
- After: 5 minutes (automated wizard)

**User Experience:**
- Before: Complex, error-prone
- After: Simple, guided, beautiful

**Security:**
- Before: Users skip security (too hard)
- After: Security by default (auto-enabled)

**Score:**
- Before: 40-60/100 (typical user)
- After: 100/100 (automatic)

---

**Status:** Ready to implement  
**Effort:** 0.5-1 day  
**Impact:** MASSIVE (makes security accessible)
