# Phase 1 Integration Plan

**Goal:** Complete Phase 1 by integrating 6 high-priority modules into production code paths.

**Status:** Ready to Execute  
**Estimated Time:** 15-21 hours (2-3 days)

---

## Integration Tasks

### 1. Rate Limiter → WebSocket Handler ⚠️ CRITICAL
**Priority:** HIGHEST (blocks brute force attacks)  
**Effort:** 2-4 hours  
**Complexity:** HIGH (complex WebSocket architecture)

**Files to modify:**
- `src/gateway/server-ws-runtime.ts` - Create rate limiter instance
- `src/gateway/server/ws-connection.ts` - Pass to handler
- `src/gateway/server/ws-connection/message-handler.ts` - Check before auth

**Integration guide:** Already documented in `src/gateway/rate-limiter-integration.md`

**Steps:**
1. Create shared `AuthRateLimiter` instance in server runtime
2. Pass as param through connection handler
3. Check rate limit before `authorizeGatewayConnect()` call
4. Record attempt result after auth
5. Close connection with retry-after on rate limit

---

### 2. Secrets Encryption → Config I/O ⚠️ CRITICAL
**Priority:** HIGHEST (protects credentials)  
**Effort:** 4-6 hours  
**Complexity:** MEDIUM (must not break existing configs)

**Files to modify:**
- `src/config/io.ts` - Encrypt on write, decrypt on read

**Steps:**
1. Import encryption functions
2. In `writeConfig()`: call `encryptSensitiveFields()` before JSON.stringify
3. In config loading: call `decryptSensitiveFields()` after JSON.parse
4. Handle mixed configs (some encrypted, some plain)
5. Add migration: first write converts plain → encrypted

**Testing:**
- Existing plain configs still load
- New writes are encrypted
- Round-trip preserves values

---

### 3. Permission Enforcer → Boot & Doctor ⚠️ HIGH
**Priority:** HIGH (prevents credential exposure)  
**Effort:** 2-3 hours  
**Complexity:** LOW

**Files to modify:**
- `src/gateway/boot.ts` - Call early in boot
- `src/commands/doctor.ts` - Add check + auto-fix

**Steps:**
1. **Boot:** Import and call `enforceSecurePermissions()` before config load
2. **Doctor:** Add permission check function
3. **Doctor:** Offer auto-fix with confirmation
4. Handle errors gracefully (don't fail boot on permission errors)

---

### 4. Command Audit Log → Bash Tools ⚠️ MEDIUM
**Priority:** MEDIUM (forensics capability)  
**Effort:** 2-3 hours  
**Complexity:** MEDIUM (multiple exec paths)

**Files to modify:**
- `src/agents/bash-tools.exec.ts` - Log all command executions

**Steps:**
1. Import `logCommand` from command-audit-log
2. Wrap command execution with logging
3. Capture: timestamp, session, command, sandbox status, exit code, duration
4. Don't fail execution on logging errors

---

### 5. Migration CLI → Security Command ⚠️ HIGH
**Priority:** HIGH (user migration support)  
**Effort:** 1-2 hours  
**Complexity:** LOW

**Files to modify:**
- `src/cli/security-cli.ts` - Register migrate subcommand

**Steps:**
1. Import `migrateToPhase1` from security-migrate
2. Add `.command('migrate')` with --dry-run option
3. Test invocation: `moltbot security migrate`

---

### 6. Config Validation → Load Pipeline ⚠️ CRITICAL
**Priority:** HIGHEST (prevents dmPolicy="open")  
**Effort:** 2-3 hours  
**Complexity:** LOW

**Files to modify:**
- `src/config/io.ts` - Validate after loading

**Steps:**
1. Import `validateChannelConfig` from validation
2. Call after config parsing
3. Throw with clear error message on validation failure
4. Ensure error includes migration guide reference

---

## Testing Checklist

After each integration:

- [ ] Code compiles: `npm run build`
- [ ] No lint errors: `npm run lint`
- [ ] Relevant tests pass: `npm test <file>.test.ts`
- [ ] Manual smoke test of feature
- [ ] No regressions in existing functionality

---

## Final Verification

Once all integrations complete:

### 1. Full Test Suite
```bash
npm test
npm run test:coverage
```
**Target:** All tests pass, coverage ≥ 70%

### 2. Lint & Build
```bash
npm run lint
npm run build
```
**Target:** Zero errors

### 3. Security Audit
```bash
npm run moltbot security audit --deep
```
**Target:** Score ≥ 85/100

### 4. Manual Testing
- [ ] Gateway starts with valid config
- [ ] Gateway rejects invalid tokens
- [ ] Gateway enforces file permissions on boot
- [ ] Config with dmPolicy="open" is rejected
- [ ] Migration command runs successfully
- [ ] Secrets are encrypted in config file

---

## Integration Order (Recommended)

**Day 1:**
1. Config validation → Load pipeline (CRITICAL, easy)
2. Migration CLI → Security command (HIGH, easy)
3. Permission enforcer → Boot (HIGH, easy)

**Day 2:**
4. Secrets encryption → Config I/O (CRITICAL, medium)
5. Command audit log → Bash tools (MEDIUM, medium)

**Day 3:**
6. Rate limiter → WebSocket handler (CRITICAL, hard)
7. Full testing and verification

---

## Risk Mitigation

### If Integration Fails
- Module is already functional as standalone
- Can be called manually or in scripts
- No loss of security capability, just convenience

### Rollback Strategy
- Each integration is atomic
- Git revert specific commits
- Modules don't depend on each other

### Testing Strategy
- Unit tests for each integration point
- Integration tests for end-to-end flows
- Manual testing with real configs

---

## Success Criteria

- ✅ All 6 integrations complete
- ✅ All tests passing
- ✅ Security score ≥ 85/100
- ✅ Zero CRITICAL findings
- ✅ Documentation updated
- ✅ Ready for production deployment

**Once complete:** Phase 1 is PRODUCTION READY 🚀
