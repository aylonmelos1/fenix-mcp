import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

function parseKeyring(raw, name) {
  if (!raw) throw new Error(`${name} is required when OAuth persistence is enabled`);
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error(`${name} must be valid JSON`); }
  if (!parsed || typeof parsed.active !== 'string' || !parsed.keys || typeof parsed.keys !== 'object') {
    throw new Error(`${name} must contain active and keys`);
  }
  const keys = new Map();
  for (const [id, encoded] of Object.entries(parsed.keys)) {
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(id) || typeof encoded !== 'string') throw new Error(`${name} has an invalid key entry`);
    let key;
    try { key = Buffer.from(encoded, 'base64'); } catch { key = Buffer.alloc(0); }
    if (key.length !== 32 || key.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) {
      throw new Error(`${name} key ${id} must be 32 bytes encoded as base64`);
    }
    keys.set(id, key);
  }
  if (!keys.has(parsed.active)) throw new Error(`${name}.active must name a key in keys`);
  return { active: parsed.active, keys };
}

export class OAuthCrypto {
  constructor({ hmacKeyring, encryptionKeyring }) {
    this.hmac = parseKeyring(hmacKeyring, 'OAUTH_HMAC_KEYRING_JSON');
    this.encryption = parseKeyring(encryptionKeyring, 'OAUTH_ENCRYPTION_KEYRING_JSON');
  }

  hash(value) {
    const id = this.hmac.active;
    const digest = createHmac('sha256', this.hmac.keys.get(id)).update(String(value)).digest('base64url');
    return `${id}:${digest}`;
  }

  lookupHashes(value) {
    return [...this.hmac.keys].map(([id, key]) => `${id}:${createHmac('sha256', key).update(String(value)).digest('base64url')}`);
  }

  matchesHash(value, stored) {
    if (typeof stored !== 'string') return false;
    const [id, digest] = stored.split(':', 2);
    const key = this.hmac.keys.get(id);
    if (!key || !digest) return false;
    const actual = createHmac('sha256', key).update(String(value)).digest();
    let expected;
    try { expected = Buffer.from(digest, 'base64url'); } catch { return false; }
    return expected.length === actual.length && timingSafeEqual(actual, expected);
  }

  encryptJson(value) {
    const id = this.encryption.active;
    const key = this.encryption.keys.get(id);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return JSON.stringify({ v: 1, keyId: id, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: ciphertext.toString('base64') });
  }

  decryptJson(envelope) {
    let parsed;
    try { parsed = typeof envelope === 'string' ? JSON.parse(envelope) : envelope; } catch { throw new Error('Stored OAuth ciphertext is malformed'); }
    const key = this.encryption.keys.get(parsed?.keyId);
    if (parsed?.v !== 1 || !key || typeof parsed.iv !== 'string' || typeof parsed.tag !== 'string' || typeof parsed.data !== 'string') {
      throw new Error('Stored OAuth ciphertext uses an unknown key or format');
    }
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(parsed.data, 'base64')), decipher.final()]).toString('utf8');
      return JSON.parse(plaintext);
    } catch {
      throw new Error('Stored OAuth ciphertext failed authentication');
    }
  }
}

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}
