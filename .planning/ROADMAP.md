# Pentagon Security Hardening - Project Roadmap

## Project Goal

Transform Moltbot from a developer-friendly tool into a hardened, production-ready platform with Pentagon-level security, eliminating all CRITICAL and HIGH priority vulnerabilities.

## Success Criteria

- ✅ Zero CRITICAL findings in `moltbot security audit --deep`
- ✅ Security score ≥ 85/100
- ✅ All credentials encrypted at rest
- ✅ Sandbox enabled by default
- ✅ No command injection vulnerabilities
- ✅ Rate limiting functional (5 failures = 5min lockout)
- ✅ All tests passing

---

## Phases

### Phase 1: Core Security Hardening
**Goal:** Implement CRITICAL and HIGH priority security fixes across authentication, sandboxing, secrets management, command execution, file permissions, and DM policies.

**Requirements:** SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06, SEC-07, SEC-08, SEC-09, SEC-10

**Must-haves:**
1. Gateway authentication required for all connections (including loopback)
2. Minimum 32-character tokens with entropy validation
3. Rate limiting on authentication attempts (5 per 5 minutes)
4. Sandbox mode defaults to "non-main" instead of "off"
5. Docker containers hardened with no-new-privileges, cap-drop ALL, network=none
6. All secrets encrypted at rest using Age encryption
7. dmPolicy="open" option removed from codebase
8. File permissions enforced (0o600 files, 0o700 directories)
9. Command execution validation for Docker setup and TUI shell
10. Comprehensive audit logging for auth and command execution

**Deliverables:**
- 10 executable plans covering all security domains
- Migration tooling for existing deployments
- Updated documentation and breaking changes guide
- Comprehensive test suite

---

## Breaking Changes

1. **Gateway auth now required** - Even for loopback connections
2. **Minimum token length: 32 chars** - Existing short tokens rejected
3. **Sandbox mode default: `non-main`** - Previously `off`
4. **`dmPolicy="open"` removed** - Must use `pairing` or `allowlist`
5. **Config format changed** - Secrets now encrypted (requires migration)
6. **File permissions enforced** - Auto-fixed to 0o600/0o700
7. **Dangerous flags deprecated** - `allowInsecureAuth`, `dangerouslyDisableDeviceAuth`
