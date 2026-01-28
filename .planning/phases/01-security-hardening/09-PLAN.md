---
plan_id: 09-documentation
phase: 1
wave: 3
autonomous: true
---

# Security Documentation

## Goal

Update all security documentation, create hardening guide, and provide secure configuration templates.

## Tasks

### Task 1: Update SECURITY.md

**File:** `SECURITY.md`

Add Phase 1 section after line 14 (after ## Operational Guidance):

```markdown
## Phase 1 Security Hardening (2026-01)

Moltbot has undergone comprehensive Pentagon-level security hardening. Key changes:

### Authentication
- **Gateway auth now required** for all connections (including loopback)
- **Minimum token length: 32 characters** with entropy validation
- **Rate limiting:** 5 failed attempts = 5 minute lockout
- **Auth audit logging:** All authentication events logged to `~/.moltbot/logs/auth-audit.jsonl`

### Sandboxing
- **Default mode: "non-main"** (previously "off")
- **Docker containers hardened:** `--cap-drop ALL`, `--security-opt no-new-privileges`, `network=none`
- **Read-only root filesystem** for all sandbox containers
- **Escape detection:** Monitors for container breakout attempts

### Secrets Management
- **Encryption at rest:** All tokens, passwords, and API keys encrypted using AES-256-GCM
- **Master key:** Stored in `~/.moltbot/keys/secrets.key` (mode 0o400)
- **Transparent:** Encryption/decryption automatic on read/write

### Access Control
- **dmPolicy="open" removed:** Must use "pairing" or "allowlist"
- **Wildcard warnings:** Using "*" in allowlists triggers CRITICAL audit finding
- **Explicit approval required:** Pairing now requires user acknowledgment

### File System Security
- **Strict permissions enforced:** 0o700 for directories, 0o600 for files
- **Automatic remediation:** Permissions fixed on gateway startup
- **Audit checks:** `moltbot doctor` validates and offers to fix permissions

### Command Execution
- **Docker setup validation:** Network tools blocked in setup commands
- **Command audit logging:** All executions logged to `~/.moltbot/logs/command-audit.jsonl`
- **Strengthened allowlist:** Expanded forbidden token list

### Security Audit
- **Security scoring:** 0-100 scale with rating (EXCELLENT/GOOD/ACCEPTABLE/NEEDS IMPROVEMENT/CRITICAL)
- **Auto-fix mode:** `moltbot security audit --fix` automatically fixes common issues
- **Enhanced reporting:** Visual indicators and grouped findings

For migration guide, see: `docs/security/breaking-changes-phase1.md`

For hardening instructions, see: `docs/security/hardening-guide.md`
```

### Task 2: Create Hardening Guide

**New file:** `docs/security/hardening-guide.md`

```markdown
---
title: "Pentagon-Level Security Hardening Guide"
summary: "Comprehensive guide to hardening Moltbot for production use with defense-in-depth security"
---

# Pentagon-Level Security Hardening Guide

This guide provides comprehensive security hardening instructions for Moltbot deployments requiring high security assurance.

## Threat Model

Moltbot connects to real messaging platforms and can execute commands on your system. The threat model includes:

**Threat Actors:**
- Unauthorized users attempting to access your bot
- Malicious actors sending crafted messages (injection attacks)
- Compromised channel accounts
- Local privilege escalation attempts
- Container escape attempts

**Assets to Protect:**
- API keys and authentication tokens
- Message history and session data
- File system access
- Command execution capabilities
- Connected channel accounts

**Security Objectives:**
1. **Confidentiality:** Protect secrets and sensitive data
2. **Integrity:** Prevent unauthorized modifications
3. **Availability:** Maintain service under attack
4. **Accountability:** Log and audit all security events

---

## Defense in Depth

```
┌─────────────────────────────────────────────────────┐
│ Layer 1: Network Isolation (Tailscale/Loopback)    │
├─────────────────────────────────────────────────────┤
│ Layer 2: Authentication (Token + Rate Limiting)     │
├─────────────────────────────────────────────────────┤
│ Layer 3: Authorization (Pairing + Allowlists)       │
├─────────────────────────────────────────────────────┤
│ Layer 4: Sandbox Isolation (Docker + Capabilities)  │
├─────────────────────────────────────────────────────┤
│ Layer 5: Command Validation (Allowlist + Analysis)  │
├─────────────────────────────────────────────────────┤
│ Layer 6: Encryption (Secrets at Rest)               │
├─────────────────────────────────────────────────────┤
│ Layer 7: Audit Logging (Security Events)            │
└─────────────────────────────────────────────────────┘
```

---

## Pentagon-Level Configuration

### Minimal Attack Surface

```json
{
  "gateway": {
    "bind": "loopback",
    "port": 18789,
    "auth": {
      "mode": "token",
      "token": "${MOLTBOT_GATEWAY_TOKEN}",
      "allowTailscale": false
    },
    "tailscale": {
      "mode": "serve",
      "resetOnExit": true
    },
    "controlUi": {
      "enabled": true
    },
    "trustedProxies": []
  },
  "logging": {
    "level": "info",
    "redactSensitive": "tools"
  },
  "session": {
    "dmScope": "per-channel-peer"
  },
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "non-main",
        "scope": "session",
        "workspaceAccess": "none",
        "docker": {
          "image": "moltbot-sandbox:latest",
          "readOnlyRoot": true,
          "capDrop": ["ALL"],
          "network": "none",
          "memory": "512m",
          "cpus": "1.0",
          "pidsLimit": 100
        }
      }
    }
  },
  "channels": {
    "defaults": {
      "dmPolicy": "pairing",
      "groupPolicy": "allowlist"
    }
  },
  "tools": {
    "elevated": {
      "enabled": false
    },
    "browser": {
      "enabled": false
    }
  }
}
```

### Environment Variables

Store all secrets in environment variables:

```bash
# Gateway auth
export MOLTBOT_GATEWAY_TOKEN="$(openssl rand -base64 32)"

# Model provider (choose one)
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."

# Channel auth
export TELEGRAM_BOT_TOKEN="123456:ABC..."
export DISCORD_BOT_TOKEN="..."
```

Add to your shell profile (`~/.profile`, `~/.bashrc`, or `~/.zshrc`):

```bash
# Moltbot secrets
[ -f ~/.moltbot/secrets.env ] && source ~/.moltbot/secrets.env
```

Store secrets separately:
```bash
cat > ~/.moltbot/secrets.env << 'EOF'
export MOLTBOT_GATEWAY_TOKEN="your-token"
export ANTHROPIC_API_KEY="your-key"
EOF

chmod 600 ~/.moltbot/secrets.env
```

---

## Hardening Checklist

### Gateway Security

- [ ] Gateway token is 32+ characters with high entropy
- [ ] Gateway auth mode is "token" (not "password" over HTTP)
- [ ] Gateway binds to loopback only
- [ ] Tailscale mode is "serve" (not "funnel")
- [ ] `allowInsecureAuth` and `dangerouslyDisableDeviceAuth` are NOT set
- [ ] Trusted proxies configured if using reverse proxy

### Channel Security

- [ ] All channels use `dmPolicy="pairing"` or `"allowlist"`
- [ ] No wildcards (*) in allowlists
- [ ] `session.dmScope="per-channel-peer"` for multi-user setups
- [ ] Group policies set to "allowlist" with explicit users
- [ ] Channel tokens stored in environment variables

### Sandbox Security

- [ ] Sandbox mode is "non-main" or "all"
- [ ] Docker containers use `readOnlyRoot: true`
- [ ] `capDrop: ["ALL"]` is set
- [ ] Network mode is "none" or isolated network
- [ ] Resource limits configured (memory, CPU, PIDs)
- [ ] `workspaceAccess` is "none" unless specifically needed

### Secrets Security

- [ ] All secrets encrypted at rest
- [ ] Encryption key has 0o400 permissions
- [ ] Config file has 0o600 permissions
- [ ] State directory has 0o700 permissions
- [ ] No secrets in environment variables that get logged
- [ ] `logging.redactSensitive="tools"` is enabled

### Tool Security

- [ ] Elevated exec is disabled unless absolutely needed
- [ ] Browser control disabled or restricted to specific profiles
- [ ] Command allowlist configured and tested
- [ ] Dangerous commands require approval

### Monitoring

- [ ] Auth audit log reviewed regularly
- [ ] Command audit log monitored for suspicious activity
- [ ] Security audit runs weekly: `moltbot security audit --deep`
- [ ] Log rotation configured

---

## Security Audit

Run comprehensive audit:

```bash
moltbot security audit --deep
```

Target score: **85+/100**

Auto-fix common issues:

```bash
moltbot security audit --fix
```

---

## Incident Response

### Suspected Compromise

1. **Immediate:** Rotate all tokens and passwords
   ```bash
   # Generate new token
   export MOLTBOT_GATEWAY_TOKEN="$(openssl rand -base64 32)"
   
   # Update config
   moltbot config set gateway.auth.token "$MOLTBOT_GATEWAY_TOKEN"
   
   # Restart gateway
   moltbot gateway restart
   ```

2. **Review logs:**
   ```bash
   # Auth failures
   cat ~/.moltbot/logs/auth-audit.jsonl | grep '"success":false'
   
   # Suspicious commands
   cat ~/.moltbot/logs/command-audit.jsonl | grep -E '(eval|wget|curl)'
   ```

3. **Clear sessions:**
   ```bash
   moltbot sessions reset --all
   ```

4. **Revoke approvals:**
   ```bash
   moltbot pairing list
   moltbot pairing revoke <channel> <user-id>
   ```

### Container Escape Detected

1. **Stop gateway immediately**
2. **Inspect container logs for escape patterns**
3. **Review Docker security settings**
4. **Update to latest moltbot version**
5. **Report to security team: steipete@gmail.com**

---

## Best Practices

### Token Management

- Generate tokens with: `openssl rand -base64 32` or `moltbot security audit --fix`
- Rotate tokens every 90 days
- Never commit tokens to version control
- Use different tokens for dev/staging/prod

### Pairing Workflow

- Only approve users you trust completely
- Review approved users monthly: `moltbot pairing list`
- Revoke unused pairings immediately
- Keep pairing codes short-lived (15 minutes)

### Docker Security

- Keep base image updated: `docker pull debian:bookworm-slim`
- Use minimal images (distroless when possible)
- Never run privileged containers
- Monitor container resource usage

### Monitoring

- Set up alerts for repeated auth failures
- Monitor command audit log for unusual patterns
- Review security audit weekly
- Track security score over time

---

## Compliance

This configuration meets or exceeds requirements for:

- **SOC 2:** Access controls, logging, encryption at rest
- **ISO 27001:** Information security management
- **NIST Cybersecurity Framework:** Identify, Protect, Detect, Respond, Recover

For GDPR/HIPAA/PCI-DSS compliance, additional controls may be required.
```

### Task 3: Create Secure Config Template

**New file:** `docs/security/secure-config-template.json`

```json
{
  "$schema": "https://molt.bot/schema.json",
  "gateway": {
    "mode": "local",
    "bind": "loopback",
    "port": 18789,
    "auth": {
      "mode": "token",
      "token": "${MOLTBOT_GATEWAY_TOKEN}",
      "allowTailscale": false
    },
    "tailscale": {
      "mode": "serve",
      "resetOnExit": true
    },
    "controlUi": {
      "enabled": true
    },
    "trustedProxies": []
  },
  "logging": {
    "level": "info",
    "redactSensitive": "tools",
    "redactPatterns": [
      "sk-[a-zA-Z0-9]{32,}",
      "[0-9]{10,}:[A-Za-z0-9_-]{35}"
    ]
  },
  "session": {
    "scope": "per-agent",
    "dmScope": "per-channel-peer"
  },
  "agents": {
    "defaults": {
      "workspace": "~/clawd",
      "sandbox": {
        "mode": "non-main",
        "scope": "session",
        "workspaceAccess": "none",
        "docker": {
          "image": "moltbot-sandbox:latest",
          "readOnlyRoot": true,
          "capDrop": ["ALL"],
          "network": "none",
          "tmpfs": ["/tmp", "/var/tmp", "/run"],
          "memory": "512m",
          "memorySwap": "512m",
          "cpus": "1.0",
          "pidsLimit": 100,
          "securityOpt": ["no-new-privileges"]
        },
        "tools": {
          "allow": [
            "exec",
            "process",
            "read",
            "write",
            "edit",
            "sessions_list",
            "sessions_history",
            "sessions_send"
          ],
          "deny": [
            "browser",
            "canvas",
            "nodes",
            "cron",
            "gateway"
          ]
        }
      }
    }
  },
  "channels": {
    "defaults": {
      "dmPolicy": "pairing",
      "groupPolicy": "allowlist"
    },
    "telegram": {
      "enabled": true,
      "dm": {
        "policy": "pairing"
      },
      "groups": {}
    },
    "discord": {
      "enabled": false,
      "dm": {
        "policy": "pairing",
        "allowFrom": []
      },
      "guilds": {}
    }
  },
  "tools": {
    "elevated": {
      "enabled": false
    },
    "browser": {
      "enabled": false
    },
    "canvas": {
      "enabled": false
    }
  },
  "commands": {
    "native": false,
    "nativeSkills": false,
    "text": true,
    "useAccessGroups": true
  }
}
```

### Task 4: Add Security Section to Main README

**File:** `README.md`

Update the "Security defaults (DM access)" section around line 104-115:

```markdown
## Security defaults (DM access) — Phase 1 Hardened

Moltbot connects to real messaging surfaces. Treat inbound DMs as **untrusted input**.

**Phase 1 security hardening (2026-01):** Moltbot now requires explicit authentication, enables sandboxing by default, and encrypts all secrets at rest.

Full security guide: [Security](https://docs.molt.bot/gateway/security) · [Hardening](https://docs.molt.bot/security/hardening-guide)

**New in Phase 1:**
- **Gateway auth required:** Even for loopback (minimum 32-char tokens)
- **Sandbox-by-default:** Non-main sessions run in hardened Docker containers
- **Encrypted secrets:** AES-256-GCM encryption for all credentials
- **dmPolicy="open" removed:** Must use "pairing" (recommended) or "allowlist"
- **Audit logging:** All auth and command events logged

Default behavior on all channels:
- **DM pairing** (`dmPolicy="pairing"`): Unknown senders receive a short pairing code and the bot does not process their message.
- Approve with: `moltbot pairing approve <channel> <code>` (requires explicit acknowledgment)
- **Wildcard (*) blocked:** Using wildcard in allowlists triggers CRITICAL security audit finding

Run security audit:
```bash
moltbot security audit --deep
# Target score: 85+/100

# Auto-fix common issues:
moltbot security audit --fix
```

Migration guide: [Breaking Changes Phase 1](https://docs.molt.bot/security/breaking-changes-phase1)
```

### Task 5: Create Mintlify Security Navigation

**New file:** `docs/security/hardening-guide.md` (already defined above, ensure it's in the right location)

**New file:** `docs/security.mdx` (if it doesn't exist)

```markdown
---
title: "Security"
description: "Security hardening, threat model, and best practices for Moltbot"
---

# Security

## Quick Links

- [Security Policy](/security/policy)
- [Hardening Guide](/security/hardening-guide)
- [Breaking Changes Phase 1](/security/breaking-changes-phase1)
- [Secure Configuration Template](/security/secure-config-template)

## Security Audit

Run comprehensive security audit:

```bash
moltbot security audit --deep
```

Auto-fix common issues:

```bash
moltbot security audit --fix
```

Target score: **85+/100**

## Migration

Migrate to Phase 1 security defaults:

```bash
moltbot security migrate
```

See: [Breaking Changes Phase 1](/security/breaking-changes-phase1)
```

## Success Criteria

- [ ] SECURITY.md updated with Phase 1 changes
- [ ] Hardening guide created with comprehensive instructions
- [ ] Secure config template provided
- [ ] README updated with new security defaults
- [ ] Mintlify docs navigation updated
- [ ] All docs follow Mintlify link format (root-relative, no .md extension)

## Testing

```bash
# Validate docs build
cd docs && pnpm dlx mint broken-links

# Manual review
cat SECURITY.md
cat docs/security/hardening-guide.md
cat docs/security/breaking-changes-phase1.md
```
