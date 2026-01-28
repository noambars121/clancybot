# Security Requirements Traceability

| Requirement | Description | Priority | Status | Phase | Notes |
|-------------|-------------|----------|--------|-------|-------|
| SEC-01 | Gateway authentication required for all connections | CRITICAL | Pending | 1 | Includes loopback |
| SEC-02 | Rate limiting on authentication attempts | CRITICAL | Pending | 1 | 5 attempts per 5 min |
| SEC-03 | Minimum 32-char tokens with entropy validation | CRITICAL | Pending | 1 | 20+ unique chars |
| SEC-04 | Sandbox enabled by default (non-main mode) | HIGH | Pending | 1 | Previously off |
| SEC-05 | Docker container hardening | HIGH | Pending | 1 | no-new-privs, cap-drop |
| SEC-06 | Secrets encrypted at rest | HIGH | Pending | 1 | Age encryption |
| SEC-07 | Remove dmPolicy="open" option | CRITICAL | Pending | 1 | Breaking change |
| SEC-08 | Enforce file permissions | HIGH | Pending | 1 | 0o600/0o700 |
| SEC-09 | Command execution validation | CRITICAL | Pending | 1 | Docker + TUI shell |
| SEC-10 | Audit logging for auth and commands | HIGH | Pending | 1 | JSONL format |
