# Security Policy

If you believe you've found a security issue in Moltbot, please report it privately.

## Reporting

- Email: `steipete@gmail.com`
- What to include: reproduction steps, impact assessment, and (if possible) a minimal PoC.

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

**Migration:** See `docs/security/breaking-changes-phase1.md`  
**Hardening:** See `docs/security/hardening-guide.md`

## Operational Guidance

For threat model + hardening guidance (including `moltbot security audit --deep` and `--fix`), see:

- `https://docs.molt.bot/gateway/security`
- `https://docs.molt.bot/security/hardening-guide`

### Web Interface Safety

Moltbot's web interface is intended for local use only. Do **not** bind it to the public internet; it is not hardened for public exposure.

## Runtime Requirements

### Node.js Version

Moltbot requires **Node.js 22.12.0 or later** (LTS). This version includes important security patches:

- CVE-2025-59466: async_hooks DoS vulnerability
- CVE-2026-21636: Permission model bypass vulnerability

Verify your Node.js version:

```bash
node --version  # Should be v22.12.0 or later
```

### Docker Security

When running Moltbot in Docker:

1. The official image runs as a non-root user (`node`) for reduced attack surface
2. Use `--read-only` flag when possible for additional filesystem protection
3. Limit container capabilities with `--cap-drop=ALL`

Example secure Docker run:

```bash
docker run --read-only --cap-drop=ALL \
  -v moltbot-data:/app/data \
  moltbot/moltbot:latest
```

## Security Scanning

This project uses `detect-secrets` for automated secret detection in CI/CD.
See `.detect-secrets.cfg` for configuration and `.secrets.baseline` for the baseline.

Run locally:

```bash
pip install detect-secrets==1.5.0
detect-secrets scan --baseline .secrets.baseline
```
