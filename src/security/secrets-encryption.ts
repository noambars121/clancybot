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

// Sensitive field paths to encrypt in config
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
  
  // Encrypt top-level sensitive paths
  for (const path of SENSITIVE_PATHS) {
    const value = getNestedValue(cloned, path);
    if (value && typeof value === 'string' && !isEncrypted(value)) {
      const encrypted = await encryptSecret(value);
      setNestedValue(cloned, path, encrypted);
    }
  }
  
  // Encrypt channel tokens
  if (cloned.channels) {
    for (const [channelId, channelConfig] of Object.entries(cloned.channels)) {
      if (channelId === 'defaults') continue;
      const ch = channelConfig as any;
      
      const tokenFields = ['token', 'botToken', 'appToken', 'apiKey', 'signingSecret'];
      for (const field of tokenFields) {
        if (ch[field] && typeof ch[field] === 'string' && !isEncrypted(ch[field])) {
          ch[field] = await encryptSecret(ch[field]);
        }
      }
      
      // Handle nested config structures (e.g., accounts)
      if (ch.accounts && typeof ch.accounts === 'object') {
        for (const [accountId, accountConfig] of Object.entries(ch.accounts)) {
          const acc = accountConfig as any;
          for (const field of tokenFields) {
            if (acc[field] && typeof acc[field] === 'string' && !isEncrypted(acc[field])) {
              acc[field] = await encryptSecret(acc[field]);
            }
          }
        }
      }
    }
  }
  
  // Encrypt model provider API keys
  if (cloned.models?.providers) {
    for (const [providerId, provider] of Object.entries(cloned.models.providers)) {
      const prov = provider as any;
      if (prov.apiKey && typeof prov.apiKey === 'string' && !isEncrypted(prov.apiKey)) {
        prov.apiKey = await encryptSecret(prov.apiKey);
      }
    }
  }
  
  return cloned;
}

export async function decryptSensitiveFields(config: any): Promise<any> {
  const cloned = JSON.parse(JSON.stringify(config));
  
  // Decrypt top-level sensitive paths
  for (const path of SENSITIVE_PATHS) {
    const value = getNestedValue(cloned, path);
    if (value && typeof value === 'string' && isEncrypted(value)) {
      const decrypted = await decryptSecret(value);
      setNestedValue(cloned, path, decrypted);
    }
  }
  
  // Decrypt channel tokens
  if (cloned.channels) {
    for (const [channelId, channelConfig] of Object.entries(cloned.channels)) {
      if (channelId === 'defaults') continue;
      const ch = channelConfig as any;
      
      const tokenFields = ['token', 'botToken', 'appToken', 'apiKey', 'signingSecret'];
      for (const field of tokenFields) {
        if (ch[field] && typeof ch[field] === 'string' && isEncrypted(ch[field])) {
          ch[field] = await decryptSecret(ch[field]);
        }
      }
      
      // Handle nested account structures
      if (ch.accounts && typeof ch.accounts === 'object') {
        for (const [accountId, accountConfig] of Object.entries(ch.accounts)) {
          const acc = accountConfig as any;
          for (const field of tokenFields) {
            if (acc[field] && typeof acc[field] === 'string' && isEncrypted(acc[field])) {
              acc[field] = await decryptSecret(acc[field]);
            }
          }
        }
      }
    }
  }
  
  // Decrypt model provider API keys
  if (cloned.models?.providers) {
    for (const [providerId, provider] of Object.entries(cloned.models.providers)) {
      const prov = provider as any;
      if (prov.apiKey && typeof prov.apiKey === 'string' && isEncrypted(prov.apiKey)) {
        prov.apiKey = await decryptSecret(prov.apiKey);
      }
    }
  }
  
  return cloned;
}
