import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { StaffSecurityCryptoPort } from './ports';

const ENVELOPE_PREFIX = 'bsc-totp.v1';
const RECOVERY_PREFIX = 'bsc-recovery.v1';
const LOGIN_PREFIX = 'bsc-login.v1';
const KEY_ID_RE = /^[a-zA-Z0-9_-]{1,48}$/u;

export type StaffSecurityKeyringConfig = {
  activeKeyId: string;
  keys: Readonly<Record<string, string>>;
};

function decodeKey(keyId: string, encoded: string): Buffer {
  if (!KEY_ID_RE.test(keyId)) throw new Error('staff_security_key_id_invalid');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error(`staff_security_key_invalid:${keyId}`);
  return key;
}

function normalizeKeyring(config: StaffSecurityKeyringConfig): {
  activeKeyId: string;
  keys: ReadonlyMap<string, Buffer>;
} {
  if (!KEY_ID_RE.test(config.activeKeyId)) throw new Error('staff_security_active_key_id_invalid');
  const keys = new Map(
    Object.entries(config.keys).map(([keyId, encoded]) => [keyId, decodeKey(keyId, encoded)]),
  );
  if (!keys.has(config.activeKeyId)) throw new Error('staff_security_active_key_missing');
  return { activeKeyId: config.activeKeyId, keys };
}

function parseKeyringJson(raw: string | undefined): StaffSecurityKeyringConfig {
  if (!raw?.trim())
    throw new Error('STAFF_SECURITY_KEYRING_JSON is required for staff security operations');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('STAFF_SECURITY_KEYRING_JSON must be valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('STAFF_SECURITY_KEYRING_JSON must be an object');
  }
  const record = parsed as Record<string, unknown>;
  if (
    typeof record.activeKeyId !== 'string' ||
    !record.keys ||
    typeof record.keys !== 'object' ||
    Array.isArray(record.keys)
  ) {
    throw new Error('STAFF_SECURITY_KEYRING_JSON must contain activeKeyId and keys');
  }
  const keyEntries = Object.entries(record.keys as Record<string, unknown>);
  if (keyEntries.length === 0 || keyEntries.some(([, value]) => typeof value !== 'string')) {
    throw new Error('STAFF_SECURITY_KEYRING_JSON keys must contain base64 strings');
  }
  return {
    activeKeyId: record.activeKeyId,
    keys: Object.fromEntries(keyEntries) as Record<string, string>,
  };
}

export function createStaffSecurityCrypto(
  config: StaffSecurityKeyringConfig,
): StaffSecurityCryptoPort {
  const keyring = normalizeKeyring(config);
  const keyFor = (keyId: string): Buffer => {
    const key = keyring.keys.get(keyId);
    if (!key) throw new Error(`staff_security_read_key_missing:${keyId}`);
    return key;
  };

  return {
    encryptTotpSecret(secret) {
      const keyId = keyring.activeKeyId;
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', keyFor(keyId), iv, { authTagLength: 16 });
      cipher.setAAD(Buffer.from(`${ENVELOPE_PREFIX}:${keyId}`, 'utf8'));
      const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
      return [
        ENVELOPE_PREFIX,
        keyId,
        iv.toString('base64url'),
        cipher.getAuthTag().toString('base64url'),
        encrypted.toString('base64url'),
      ].join('.');
    },

    decryptTotpSecret(envelope) {
      const [namespace, version, keyId, ivRaw, tagRaw, payloadRaw, extra] = envelope.split('.');
      if (
        `${namespace}.${version}` !== ENVELOPE_PREFIX ||
        !keyId ||
        !ivRaw ||
        !tagRaw ||
        !payloadRaw ||
        extra
      ) {
        throw new Error('staff_security_envelope_invalid');
      }
      const decipher = createDecipheriv(
        'aes-256-gcm',
        keyFor(keyId),
        Buffer.from(ivRaw, 'base64url'),
        {
          authTagLength: 16,
        },
      );
      decipher.setAAD(Buffer.from(`${ENVELOPE_PREFIX}:${keyId}`, 'utf8'));
      decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(payloadRaw, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    },

    hashRecoveryCode(code) {
      const keyId = keyring.activeKeyId;
      const digest = createHmac('sha256', keyFor(keyId))
        .update(`${RECOVERY_PREFIX}:${code.trim().toUpperCase()}`)
        .digest('base64url');
      return `${RECOVERY_PREFIX}.${keyId}.${digest}`;
    },

    matchRecoveryCodeHash(code, storedHashes) {
      for (const stored of storedHashes) {
        const [namespace, version, keyId, digest, extra] = stored.split('.');
        if (`${namespace}.${version}` !== RECOVERY_PREFIX || !keyId || !digest || extra) {
          throw new Error('staff_security_recovery_hash_invalid');
        }
        const expected = createHmac('sha256', keyFor(keyId))
          .update(`${RECOVERY_PREFIX}:${code.trim().toUpperCase()}`)
          .digest('base64url');
        const actualBuffer = Buffer.from(digest);
        const expectedBuffer = Buffer.from(expected);
        if (
          actualBuffer.length === expectedBuffer.length &&
          timingSafeEqual(actualBuffer, expectedBuffer)
        ) {
          return stored;
        }
      }
      return null;
    },

    hashLoginChallenge(token) {
      const keyId = keyring.activeKeyId;
      const digest = createHmac('sha256', keyFor(keyId))
        .update(`${LOGIN_PREFIX}:${token}`)
        .digest('base64url');
      return `${LOGIN_PREFIX}.${keyId}.${digest}`;
    },

    matchesLoginChallenge(token, storedHash) {
      const [namespace, version, keyId, digest, extra] = storedHash.split('.');
      if (`${namespace}.${version}` !== LOGIN_PREFIX || !keyId || !digest || extra) {
        throw new Error('staff_security_login_hash_invalid');
      }
      const expected = createHmac('sha256', keyFor(keyId))
        .update(`${LOGIN_PREFIX}:${token}`)
        .digest('base64url');
      const actualBuffer = Buffer.from(digest);
      const expectedBuffer = Buffer.from(expected);
      return (
        actualBuffer.length === expectedBuffer.length &&
        timingSafeEqual(actualBuffer, expectedBuffer)
      );
    },
  };
}

export function createLazyStaffSecurityCryptoFromEnv(
  readRaw: () => string | undefined = () => process.env.STAFF_SECURITY_KEYRING_JSON,
): StaffSecurityCryptoPort {
  let loaded: StaffSecurityCryptoPort | null = null;
  const get = () => {
    loaded ??= createStaffSecurityCrypto(parseKeyringJson(readRaw()));
    return loaded;
  };
  return {
    encryptTotpSecret: (secret) => get().encryptTotpSecret(secret),
    decryptTotpSecret: (envelope) => get().decryptTotpSecret(envelope),
    hashRecoveryCode: (code) => get().hashRecoveryCode(code),
    matchRecoveryCodeHash: (code, hashes) => get().matchRecoveryCodeHash(code, hashes),
    hashLoginChallenge: (token) => get().hashLoginChallenge(token),
    matchesLoginChallenge: (token, hash) => get().matchesLoginChallenge(token, hash),
  };
}
