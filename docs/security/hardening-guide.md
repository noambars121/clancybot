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

See: [`docs/security/secure-config-template.json`](/security/secure-config-template) for full example.

### Key Security Settings

```json
{
  "gateway": {
    "bind": "loopback",
    "auth": {
      "mode": "token",
      "token": "${MOLTBOT_GATEWAY_TOKEN}",
      "allowTailscale": false
    },
    "tailscale": {
      "mode": "serve",
      "resetOnExit": true
    }
  },
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "non-main",
        "workspaceAccess": "none",
        "docker": {
          "readOnlyRoot": true,
          "capDrop": ["ALL"],
          "network": "none",
          "memory": "512m",
          "cpus": "1.0"
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
    }
  },
  "logging": {
    "redactSensitive": "tools"
  }
}
```

---

## Hardening Checklist

### Gateway Security

- [ ] Gateway token is 32+ characters with high entropy
- [ ] Gateway binds to loopback only
- [ ] Tailscale mode is "serve" (not "funnel")
- [ ] No dangerous bypass flags set
- [ ] Trusted proxies configured if using reverse proxy

### Channel Security

- [ ] All channels use `dmPolicy="pairing"`
- [ ] No wildcards (*) in allowlists
- [ ] `session.dmScope="per-channel-peer"` for multi-user
- [ ] Group policies set to "allowlist"

### Sandbox Security

- [ ] Sandbox mode is "non-main" or "all"
- [ ] Docker containers use `readOnlyRoot: true`
- [ ] `capDrop: ["ALL"]` is set
- [ ] Network mode is "none"
- [ ] Resource limits configured

### Secrets Security

- [ ] All secrets encrypted at rest
- [ ] Encryption key has 0o400 permissions
- [ ] Config file has 0o600 permissions
- [ ] `logging.redactSensitive="tools"` enabled

---

## Security Audit

Run comprehensive audit:

```bash
moltbot security audit --deep
```

Target score: **85+/100**

Auto-fix:

```bash
moltbot security audit --fix
```

---

## Incident Response

### Suspected Compromise

1. Rotate all tokens immediately
2. Review auth-audit.jsonl for failures
3. Review command-audit.jsonl for suspicious commands
4. Clear sessions: `moltbot sessions reset --all`
5. Revoke pairings: `moltbot pairing revoke <channel> <user>`

### Container Escape Detected

1. Stop gateway immediately
2. Inspect container logs
3. Review Docker security settings
4. Update to latest version
5. Report: steipete@gmail.com

---

## Best Practices

### Token Management

- Generate: `openssl rand -base64 32`
- Rotate every 90 days
- Never commit to version control
- Use different tokens for dev/prod

### Monitoring

- Review auth-audit.jsonl daily
- Monitor command-audit.jsonl for unusual patterns
- Run security audit weekly
- Track security score over time

---

## Compliance

This configuration meets requirements for:
- **SOC 2:** Access controls, logging, encryption
- **ISO 27001:** Information security management
- **NIST CSF:** Identify, Protect, Detect, Respond, Recover
