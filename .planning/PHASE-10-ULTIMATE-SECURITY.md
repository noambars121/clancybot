# Phase 10: Pentagon++++ (Ultimate Security)

**Status:** 📋 Planning  
**Level:** Pentagon++++ (Ultimate)  
**Based on:** User recommendations (Memory purge, Network policies)  
**Philosophy:** "Complete control over data and network access"

---

## 🎯 Overview

Phase 9 achieved **Pentagon+++** with industry-leading features. Phase 10 adds **2 critical capabilities** for ultimate control:

1. **Granular Memory Purge** - "Right to be Forgotten" in vector memory
2. **Per-Skill Network Policies** - Dynamic network isolation per skill

These features address:
- ✅ **Data sovereignty:** Complete control over what's remembered
- ✅ **Granular network control:** Least-privilege network access per skill

---

## 🧠 Feature 1: Granular Memory Purge (הזכות להישכח)

### The Problem

**Current State:**
- Bot has persistent personal memory in Markdown files
- Memory is embedded in Vector Database for RAG (context retrieval)
- Simple file deletion may not be enough

**Scenario:**
```
User accidentally shares:
  "My password is SuperSecret123!"

Bot stores:
  1. MEMORY.md (plaintext)
  2. Vector DB (embeddings)
  
User deletes MEMORY.md ❌
→ But embeddings still exist in vector DB!
→ Can be retrieved via semantic search
→ "Right to be Forgotten" violated
```

**Risk:** GDPR compliance, user privacy, sensitive data retention

---

### The Solution

**Memory Doctor** - Complete data purge across all memory layers

```typescript
// Architecture
┌─────────────────────────────────────────┐
│         Memory Layers                    │
├─────────────────────────────────────────┤
│ 1. Markdown files (MEMORY.md)          │
│ 2. Vector embeddings (RAG DB)          │
│ 3. Conversation logs (*.jsonl)         │
│ 4. Agent sessions (session cache)      │
│ 5. Backup files (if any)               │
└─────────────────────────────────────────┘
                  ↓
         Memory Doctor scans ALL
                  ↓
       Purges matching content
```

### Implementation Plan

#### Files to Create

1. **`src/memory/memory-doctor.ts`** (~600 LOC)
   - `MemoryDoctor` class
   - Scan all memory layers
   - Semantic search for content
   - Delete from all sources
   - Verification scan

2. **`src/memory/vector-purge.ts`** (~400 LOC)
   - Vector DB integration
   - Semantic similarity search
   - Embedding deletion
   - Re-indexing after purge

3. **`src/commands/memory-purge.ts`** (~300 LOC)
   - Interactive CLI
   - `moltbot memory purge "password"`
   - Preview before delete
   - Confirmation workflow
   - Verification report

4. **Tests** (~300 LOC)
   - Memory layer scanning
   - Purge operations
   - Verification

### Key Features

✅ **Multi-layer scanning:**
- Markdown files (full-text search)
- Vector embeddings (semantic search)
- Conversation logs (regex + semantic)
- Session cache (in-memory)
- Backups (if enabled)

✅ **Semantic matching:**
```typescript
// Not just exact match
purge("my password")

// Also finds:
- "the password I use is..."
- "my login credentials are..."
- "my secret is..."
```

✅ **Preview mode:**
```bash
moltbot memory purge "credit card" --preview

Found 3 matches:
  1. MEMORY.md:45 - "My credit card ends in 1234"
  2. vectors.db:vec_123 - [semantic match]
  3. session.jsonl:890 - "card number discussion"

Purge all? [y/N]:
```

✅ **Verification:**
```bash
After purge:
✅ Scanned 5 memory layers
✅ Deleted 3 instances
✅ Verified: No matches remain
✅ Memory is clean
```

✅ **Audit trail:**
- Log all purge operations
- What was deleted
- When
- By whom
- Verification results

### Example Usage

```bash
# Interactive mode
moltbot memory purge

What to purge? my password
🔍 Scanning memory layers...

Found in:
  • MEMORY.md (1 match)
  • Vector DB (2 embeddings)
  • Session logs (1 mention)

Preview:
  MEMORY.md:123 - "My password is [REDACTED]"
  
Delete all? [y/N]: y

✅ Purged from all layers
✅ Verified clean
✅ Audit log updated

# Direct command
moltbot memory purge "credit card" --no-preview --force

# Semantic search
moltbot memory purge "sensitive financial info" --semantic

# Dry run
moltbot memory purge "ssn" --dry-run
```

### Privacy Compliance

✅ **GDPR compliant:**
- Right to erasure (Article 17)
- Complete data removal
- Verification proof

✅ **Audit trail:**
- When data was added
- When purge requested
- What was deleted
- Verification results

✅ **User control:**
- Search their own data
- Preview before delete
- Verify completion

### Technical Details

**Vector DB Integration:**
```typescript
// Example with Chroma/FAISS/Pinecone
class VectorPurge {
  async findSimilar(query: string, threshold = 0.8) {
    const embedding = await this.embed(query);
    const results = await this.vectorDB.search(embedding, {
      threshold,
      limit: 100,
    });
    return results;
  }

  async deleteVectors(ids: string[]) {
    await this.vectorDB.delete(ids);
    await this.vectorDB.reindex();
  }
}
```

**Multi-layer Search:**
```typescript
class MemoryDoctor {
  async scan(query: string): Promise<MemoryMatch[]> {
    const matches: MemoryMatch[] = [];

    // Layer 1: Markdown
    matches.push(...await this.scanMarkdown(query));

    // Layer 2: Vectors (semantic)
    matches.push(...await this.scanVectors(query));

    // Layer 3: Logs
    matches.push(...await this.scanLogs(query));

    // Layer 4: Cache
    matches.push(...await this.scanCache(query));

    return matches;
  }
}
```

**Effort:** 2 days

---

## 🌐 Feature 2: Per-Skill Network Policies (בידוד רשת דינמי)

### The Problem

**Current State:**
- Skills have permission system (file, exec, etc.)
- Network access is all-or-nothing

**Scenario:**
```
Weather Skill:
  ✅ Needs: api.weather.com
  ❌ Should NOT access: Internal network, other APIs

Server Admin Skill:
  ✅ Needs: Internal IPs (192.168.x.x)
  ❌ Should NOT access: External internet

Current: Both get "network" permission or neither
→ Weather skill could access internal network ❌
→ Server skill could exfiltrate data ❌
```

**Risk:** Data exfiltration, SSRF, lateral movement

---

### The Solution

**Per-Skill Network Firewall** - Granular network policies per skill

```typescript
// Network Policy Example
{
  "skill": "weather",
  "network": {
    "allow": [
      "api.weather.com",
      "api.openweathermap.org"
    ],
    "block": [
      "192.168.*.*",    // Private IPs
      "10.*.*.*",       // Private IPs
      "169.254.*.*",    // Cloud metadata
      "localhost"
    ],
    "ports": {
      "allow": [80, 443],
      "block": [22, 3389]  // SSH, RDP
    }
  }
}
```

### Implementation Plan

#### Files to Create

1. **`src/skills/network-policy.ts`** (~500 LOC)
   - `NetworkPolicyManager` class
   - Policy definition (allowlist/blocklist)
   - URL validation
   - IP range checks
   - Port validation
   - DNS resolution

2. **`src/skills/network-enforcer.ts`** (~400 LOC)
   - Request interceptor
   - Policy enforcement
   - Audit logging
   - Violation alerts

3. **`src/commands/skills-network.ts`** (~200 LOC)
   - `moltbot skills network <skill> --allow api.weather.com`
   - `moltbot skills network <skill> --block "192.168.*"`
   - Policy viewer/editor

4. **Tests** (~300 LOC)
   - Policy validation
   - Enforcement
   - Edge cases

### Key Features

✅ **Allowlist mode:**
```json
{
  "skill": "weather",
  "network": {
    "mode": "allowlist",
    "allow": ["api.weather.com"]
  }
}
// Blocks everything except allowed
```

✅ **Blocklist mode:**
```json
{
  "skill": "github-stats",
  "network": {
    "mode": "blocklist",
    "block": ["192.168.*.*", "10.*.*.*"]
  }
}
// Allows everything except blocked
```

✅ **Domain patterns:**
```typescript
// Wildcards
"*.weather.com"      // api.weather.com, data.weather.com
"api.*.com"          // api.weather.com, api.news.com

// Regex
"^https://api\\..*\\.com$"
```

✅ **IP range checks:**
```typescript
// CIDR notation
"192.168.0.0/16"     // 192.168.x.x
"10.0.0.0/8"         // 10.x.x.x

// Wildcards
"192.168.*.*"
"10.*.*.*"

// Special ranges
"private"            // All private IPs
"localhost"          // 127.0.0.1, ::1
"metadata"           // Cloud metadata (169.254.169.254)
```

✅ **Port restrictions:**
```json
{
  "ports": {
    "allow": [80, 443],           // HTTP, HTTPS only
    "block": [22, 3389, 5432]     // SSH, RDP, PostgreSQL
  }
}
```

✅ **Protocol restrictions:**
```json
{
  "protocols": {
    "allow": ["https"],           // HTTPS only
    "block": ["ftp", "telnet"]    // Insecure protocols
  }
}
```

✅ **Real-time enforcement:**
```typescript
// Before every network request
await networkEnforcer.check(skillId, url);

// If blocked:
throw new Error("Network policy violation: 192.168.1.1 is blocked");
```

✅ **Audit logging:**
```typescript
// Log every request
{
  skill: "weather",
  url: "https://api.weather.com/data",
  allowed: true,
  policy: "allowlist",
  timestamp: "2026-01-28T15:30:00Z"
}

// Log violations
{
  skill: "weather",
  url: "http://192.168.1.1/admin",
  allowed: false,
  reason: "IP in blocklist (private)",
  timestamp: "2026-01-28T15:31:00Z"
}
```

### Example Usage

```bash
# Create policy
moltbot skills network weather --mode allowlist

# Add allowed domain
moltbot skills network weather --allow "api.weather.com"
moltbot skills network weather --allow "*.openweathermap.org"

# Block internal network
moltbot skills network weather --block "192.168.*.*"
moltbot skills network weather --block "private"

# View policy
moltbot skills network weather --show

Network Policy: weather
  Mode: allowlist
  Allowed:
    • api.weather.com
    • *.openweathermap.org
  Blocked:
    • 192.168.*.*
    • private IPs
  Ports: 80, 443 only

# Test policy (dry run)
moltbot skills network weather --test "https://api.weather.com"
✅ Allowed

moltbot skills network weather --test "http://192.168.1.1"
❌ Blocked: Private IP in blocklist
```

### Advanced Features

**1. Preset policies:**
```typescript
// Built-in presets
moltbot skills network weather --preset "public-api"
// → Allows: External HTTPS APIs only
// → Blocks: Private IPs, localhost, metadata

moltbot skills network admin --preset "internal-only"
// → Allows: Private IPs only
// → Blocks: External internet

moltbot skills network data --preset "no-network"
// → Blocks: Everything
```

**2. Temporary exceptions:**
```bash
# Allow for 1 hour
moltbot skills network weather --allow "api.new-service.com" --ttl 1h

# After 1 hour, auto-revoked
```

**3. Policy inheritance:**
```json
{
  "skill": "weather-extended",
  "extends": "weather",    // Inherit base policy
  "network": {
    "allow": ["+forecast.io"]  // Add to parent
  }
}
```

**4. Policy testing:**
```bash
# Test before applying
moltbot skills network weather --test-policy policy.json

Testing policy...
  ✅ api.weather.com (allowed)
  ✅ 192.168.1.1 (blocked)
  ✅ metadata server (blocked)
  
Ready to apply? [y/N]:
```

### Technical Implementation

**Request Interceptor:**
```typescript
class NetworkEnforcer {
  async intercept(skillId: string, url: string): Promise<boolean> {
    const policy = await this.getPolicy(skillId);
    
    if (!policy) {
      return true;  // No policy = allow all
    }

    // Parse URL
    const parsed = new URL(url);
    
    // Check protocol
    if (!this.checkProtocol(parsed.protocol, policy)) {
      throw new NetworkPolicyViolation("Protocol blocked");
    }

    // Check domain
    if (!this.checkDomain(parsed.hostname, policy)) {
      throw new NetworkPolicyViolation("Domain blocked");
    }

    // Check IP (resolve DNS)
    const ip = await this.resolve(parsed.hostname);
    if (!this.checkIP(ip, policy)) {
      throw new NetworkPolicyViolation("IP blocked");
    }

    // Check port
    if (!this.checkPort(parsed.port, policy)) {
      throw new NetworkPolicyViolation("Port blocked");
    }

    // Log allowed request
    await this.log({ skillId, url, allowed: true });
    
    return true;
  }
}
```

**IP Range Validation:**
```typescript
function isPrivateIP(ip: string): boolean {
  const private = [
    /^10\./,                    // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
    /^192\.168\./,              // 192.168.0.0/16
    /^127\./,                   // 127.0.0.0/8 (localhost)
    /^169\.254\./,              // 169.254.0.0/16 (link-local)
  ];

  return private.some(pattern => pattern.test(ip));
}
```

**Effort:** 1.5 days

---

## 📊 Phase 10 Summary

### Features (2)
| # | Feature | LOC | Effort | Priority |
|---|---------|-----|--------|----------|
| 1 | Granular Memory Purge | 1,600 | 2 days | 🔴 HIGH |
| 2 | Per-Skill Network Policies | 1,400 | 1.5 days | 🔴 HIGH |
| **TOTAL** | **~3,000 LOC** | **3.5 days** | - |

### Defense Layers (New)
- Layer 13: **Memory Purge** (complete data sovereignty)
- Layer 14: **Network Policies** (granular network control)

**Total Layers:** 14! (was 12)

---

## 🎯 Expected Results

### Before Phase 10 (Pentagon+++)
```
Security: 100/100
Layers: 12
Memory Control: File deletion only
Network Access: All-or-nothing per skill
Data Sovereignty: Partial (Markdown only)
```

### After Phase 10 (Pentagon++++)
```
Security: 100/100 (maintained)
Layers: 14 (+2)
Memory Control: Multi-layer purge (Markdown + vectors)
Network Access: Granular per-skill policies
Data Sovereignty: Complete (all memory layers)
Privacy Compliance: GDPR "Right to be Forgotten"
```

---

## 🏆 Pentagon++++ Certification

**Requirements:**
- ✅ Pentagon+++ baseline
- ✅ 14+ defense layers ← Will have 14!
- ✅ Complete data sovereignty ← Memory purge
- ✅ Granular network control ← Per-skill policies
- ✅ Privacy compliance ← GDPR erasure

**Status:** Will achieve after Phase 10

---

## 🤔 Should We Implement?

### Value Proposition

**1. Memory Purge:**
- ✅ GDPR compliance ("Right to be Forgotten")
- ✅ User privacy (complete control)
- ✅ Sensitive data protection
- ✅ Peace of mind (mistakes can be erased)

**2. Network Policies:**
- ✅ Least-privilege network access
- ✅ Prevent lateral movement
- ✅ SSRF mitigation (skill-level)
- ✅ Data exfiltration prevention

### Implementation Options

**Option A: Implement Both (3.5 days)**
- Maximum control
- Complete data sovereignty
- Granular network security

**Option B: Memory Purge Only (2 days)**
- Privacy-focused
- GDPR compliance
- Critical for sensitive use cases

**Option C: Network Policies Only (1.5 days)**
- Security-focused
- Skill isolation
- Enterprise deployments

**Option D: Stay at Pentagon+++ (Current)**
- Already excellent (100/100)
- 12 defense layers
- Production-ready

---

## 📈 Impact Comparison

| Metric | Phase 9 | Phase 10 | Improvement |
|--------|---------|----------|-------------|
| Security | 100/100 | 100/100 | - |
| Layers | 12 | 14 | +17% |
| Memory Control | File only | Multi-layer | ∞ |
| Network Control | Binary | Granular | Strong |
| Privacy Compliance | Partial | Full GDPR | Complete |
| Skill Isolation | Code + Sandbox | +Network | Better |

---

## 🎓 Research Sources

1. **Memory Purge:**
   - GDPR Article 17 (Right to Erasure)
   - Vector database best practices
   - Data retention policies

2. **Network Policies:**
   - Zero Trust architecture
   - Least-privilege principles
   - Application-level firewalls

---

**Status:** 📋 Planned  
**Priority:** Optional (already at Pentagon+++)  
**Value:** Privacy compliance + Granular control  
**Effort:** 2-3.5 days (depending on scope)

---

*Phase 10: Pentagon++++ - Ultimate control over data and network.*

**מה תרצה לעשות?**
1. לממש Phase 10 מלא? (3.5 days)
2. רק Memory Purge? (2 days)
3. רק Network Policies? (1.5 days)
4. להישאר ב-Pentagon+++? (גם מצוין!)
