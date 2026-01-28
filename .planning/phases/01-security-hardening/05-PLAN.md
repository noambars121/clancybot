---
plan_id: 05-secrets-encryption
phase: 1
wave: 2
autonomous: true
---

# Secrets Encryption at Rest

## Goal

Implement Age encryption for all secrets stored at rest in config files, auth profiles, and credentials.

## Context

Currently, all secrets (tokens, passwords, API keys) are stored in plain text JSON files. This is a HIGH security risk. We need to encrypt them using Age encryption.

**Note:** This plan requires Node.js native crypto. We'll use a TypeScript-native solution instead of `@stablelib/age` to avoid compilation issues.

## Tasks

### Task 1: Add Encryption Dependencies

**File:** `package.json`

We'll use Node.js built-in crypto instead of external dependencies for better compatibility. No new dependencies needed.

### Task 2: Create Encryption Service

**New file:** `src/security/secrets-encryption.ts`

```typescript
import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32;
const AUTH_TAG_LENGTH = 16;
const SCRYPT_N = 16384; // CPU/memory cost
const SCRYPT_R = 8; // Block size
const SCRYPT_P = 1; // Parallelization

export interface EncryptedData {
  version: 1;
  algorithm: 'aes-256-gcm';
  ciphertext: string; // Base64
  iv: string; // Base64
  authTag: string; // Base64
  salt: string; // Base64
}

async function ensureKeyDir(): Promise<string> {
  const keyDir = path.join(resolveStateDir(), 'keys');
  await fs.mkdir(keyDir, { recursive: true, mode: 0o700 });
  return keyDir;
}

async function getKeyPath(): Promise<string> {
  const keyDir = await ensureKeyDir();
  return path.join(keyDir, 'secrets.key');
}

async function loadOrGenerateKey(): Promise<Buffer> {
  const keyPath = await getKeyPath();
  
  try {
    const keyHex = await fs.readFile(keyPath, 'utf-8');
    return Buffer.from(keyHex.trim(), 'hex');
  } catch {
    // Generate new key
    const key = randomBytes(KEY_LENGTH);
    await fs.writeFile(keyPath, key.toString('hex'), { mode: 0o400 });
    console.log(`Generated new encryption key: ${keyPath}`);
    return key;
  }
}

function deriveKey(password: Buffer, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
}

export async function initializeEncryption(): Promise<void> {
  await loadOrGenerateKey();
  console.log('Encryption initialized');
}

export async function encryptSecret(data: string): Promise<string> {
  const masterKey = await loadOrGenerateKey();
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(masterKey, salt);
  
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(data, 'utf8'),
    cipher.final(),
  ]);
  
  const authTag = cipher.getAuthTag();
  
  const result: EncryptedData = {
    version: 1,
    algorithm: ALGORITHM,
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    salt: salt.toString('base64'),
  };
  
  return JSON.stringify(result);
}

export async function decryptSecret(encryptedStr: string): Promise<string> {
  const encrypted: EncryptedData = JSON.parse(encryptedStr);
  
  if (encrypted.version !== 1 || encrypted.algorithm !== ALGORITHM) {
    throw new Error('Unsupported encryption format');
  }
  
  const masterKey = await loadOrGenerateKey();
  const salt = Buffer.from(encrypted.salt, 'base64');
  const key = deriveKey(masterKey, salt);
  
  const iv = Buffer.from(encrypted.iv, 'base64');
  const authTag = Buffer.from(encrypted.authTag, 'base64');
  const ciphertext = Buffer.from(encrypted.ciphertext, 'base64');
  
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  
  return decrypted.toString('utf8');
}

export function isEncrypted(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const parsed = JSON.parse(value);
    return (
      parsed.version === 1 &&
      parsed.algorithm === ALGORITHM &&
      typeof parsed.ciphertext === 'string' &&
      typeof parsed.iv === 'string' &&
      typeof parsed.authTag === 'string' &&
      typeof parsed.salt === 'string'
    );
  } catch {
    return false;
  }
}

// Helper to encrypt/decrypt config fields
const SENSITIVE_PATHS = [
  'gateway.auth.token',
  'gateway.auth.password',
  'gateway.remote.token',
  'gateway.remote.password',
];

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  const last = keys.pop()!;
  const target = keys.reduce((current, key) => {
    if (!current[key]) current[key] = {};
    return current[key];
  }, obj);
  target[last] = value;
}

export async function encryptSensitiveFields(config: any): Promise<any> {
  const cloned = JSON.parse(JSON.stringify(config));
  
  for (const path of SENSITIVE_PATHS) {
    const value = getNestedValue(cloned, path);
    if (value && typeof value === 'string' && !isEncrypted(value)) {
      const encrypted = await encryptSecret(value);
      setNestedValue(cloned, path, encrypted);
    }
  }
  
  // Also encrypt channel tokens
  if (cloned.channels) {
    for (const [channelId, channelConfig] of Object.entries(cloned.channels)) {
      if (channelId === 'defaults') continue;
      const ch = channelConfig as any;
      
      if (ch.token && typeof ch.token === 'string' && !isEncrypted(ch.token)) {
        ch.token = await encryptSecret(ch.token);
      }
      if (ch.botToken && typeof ch.botToken === 'string' && !isEncrypted(ch.botToken)) {
        ch.botToken = await encryptSecret(ch.botToken);
      }
      if (ch.appToken && typeof ch.appToken === 'string' && !isEncrypted(ch.appToken)) {
        ch.appToken = await encryptSecret(ch.appToken);
      }
      if (ch.apiKey && typeof ch.apiKey === 'string' && !isEncrypted(ch.apiKey)) {
        ch.apiKey = await encryptSecret(ch.apiKey);
      }
    }
  }
  
  return cloned;
}

export async function decryptSensitiveFields(config: any): Promise<any> {
  const cloned = JSON.parse(JSON.stringify(config));
  
  for (const path of SENSITIVE_PATHS) {
    const value = getNestedValue(cloned, path);
    if (value && typeof value === 'string' && isEncrypted(value)) {
      const decrypted = await decryptSecret(value);
      setNestedValue(cloned, path, decrypted);
    }
  }
  
  // Also decrypt channel tokens
  if (cloned.channels) {
    for (const [channelId, channelConfig] of Object.entries(cloned.channels)) {
      if (channelId === 'defaults') continue;
      const ch = channelConfig as any;
      
      if (ch.token && typeof ch.token === 'string' && isEncrypted(ch.token)) {
        ch.token = await decryptSecret(ch.token);
      }
      if (ch.botToken && typeof ch.botToken === 'string' && isEncrypted(ch.botToken)) {
        ch.botToken = await decryptSecret(ch.botToken);
      }
      if (ch.appToken && typeof ch.appToken === 'string' && isEncrypted(ch.appToken)) {
        ch.appToken = await decryptSecret(ch.appToken);
      }
      if (ch.apiKey && typeof ch.apiKey === 'string' && isEncrypted(ch.apiKey)) {
        ch.apiKey = await decryptSecret(ch.apiKey);
      }
    }
  }
  
  return cloned;
}
```

### Task 3: Update Config I/O

**File:** `src/config/io.ts`

Add encryption to config read/write. Find `writeConfig()` and `readConfig()` functions:

Add import at top:
```typescript
import {
  encryptSensitiveFields,
  decryptSensitiveFields,
  initializeEncryption,
} from "../security/secrets-encryption.js";
```

Update `writeConfig()` (around line 489):

```typescript
// Before writing
const encrypted = await encryptSensitiveFields(config);
await fs.writeFile(configPath, JSON.stringify(encrypted, null, 2), {
  mode: 0o600,
});
```

Update config loading (around line 150-200):

```typescript
// After parsing JSON5
const parsed = JSON5.parse(content);

// Decrypt if needed
const decrypted = await decryptSensitiveFields(parsed);

return decrypted;
```

### Task 4: Encrypt Auth Profiles

**File:** `src/agents/auth-profiles/store.ts`

Add import at top:
```typescript
import { encryptSecret, decryptSecret, isEncrypted } from "../../security/secrets-encryption.js";
```

Update `saveAuthProfileStore()` to encrypt before saving:

```typescript
// Encrypt sensitive data before saving
const encrypted = JSON.parse(JSON.stringify(store));

for (const [provider, profiles] of Object.entries(encrypted.profiles)) {
  for (const [profileId, profile] of Object.entries(profiles)) {
    const p = profile as any;
    if (p.apiKey && typeof p.apiKey === 'string' && !isEncrypted(p.apiKey)) {
      p.apiKey = await encryptSecret(p.apiKey);
    }
    if (p.accessToken && typeof p.accessToken === 'string' && !isEncrypted(p.accessToken)) {
      p.accessToken = await encryptSecret(p.accessToken);
    }
    if (p.refreshToken && typeof p.refreshToken === 'string' && !isEncrypted(p.refreshToken)) {
      p.refreshToken = await encryptSecret(p.refreshToken);
    }
  }
}

await fs.writeFile(storePath, JSON.stringify(encrypted, null, 2), { mode: 0o600 });
```

Update loading to decrypt:

```typescript
// After reading file
const parsed = JSON.parse(content);

for (const [provider, profiles] of Object.entries(parsed.profiles)) {
  for (const [profileId, profile] of Object.entries(profiles)) {
    const p = profile as any;
    if (p.apiKey && typeof p.apiKey === 'string' && isEncrypted(p.apiKey)) {
      p.apiKey = await decryptSecret(p.apiKey);
    }
    if (p.accessToken && typeof p.accessToken === 'string' && isEncrypted(p.accessToken)) {
      p.accessToken = await decryptSecret(p.accessToken);
    }
    if (p.refreshToken && typeof p.refreshToken === 'string' && isEncrypted(p.refreshToken)) {
      p.refreshToken = await decryptSecret(p.refreshToken);
    }
  }
}

return parsed;
```

## Success Criteria

- [ ] Encryption service created using Node.js crypto
- [ ] Master key generated and stored with 0o400 permissions
- [ ] Config I/O encrypts/decrypts sensitive fields
- [ ] Auth profiles encrypted/decrypted on save/load
- [ ] Encryption is transparent to the rest of the codebase
- [ ] Existing plain-text secrets are encrypted on first write

## Testing

```bash
# Test encryption service
pnpm test src/security/secrets-encryption.test.ts

# Integration test
pnpm test src/config/io.test.ts

# Manual test - secrets should be encrypted in file
pnpm moltbot config set gateway.auth.token "test-token-32-characters-long-abc"
cat ~/.moltbot/moltbot.json | grep token
# Should show encrypted JSON, not plain text
```
