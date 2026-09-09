import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const NATIVE_PUSH_APP_IDS = ['therapygo', 'therapysto'] as const;
export const NATIVE_PUSH_PROVIDERS = ['rustore', 'fcm', 'hms'] as const;
export type NativePushAppId = (typeof NATIVE_PUSH_APP_IDS)[number];
export type NativePushProvider = (typeof NATIVE_PUSH_PROVIDERS)[number];
export type NativePushTokenCipherContext = {
  userId: string;
  appId: NativePushAppId;
  provider: NativePushProvider;
  installationIdHash: string;
};
export type NativePushTokenCipher = {
  encrypt(token: string, context: NativePushTokenCipherContext): { ciphertext: string; keyId: string };
  decrypt(ciphertext: string, keyId: string, context: NativePushTokenCipherContext): string;
};

export function nativePushHash(value: string): string { return createHash('sha256').update(value).digest('base64url'); }
export function isNativePushProvider(value: unknown): value is NativePushProvider { return typeof value === 'string' && (NATIVE_PUSH_PROVIDERS as readonly string[]).includes(value); }

function aad(context: NativePushTokenCipherContext): Buffer {
  return Buffer.from(`${context.userId}:${context.appId}:${context.provider}:${context.installationIdHash}`, 'utf8');
}

/** Dedicated bootstrap keyring. It intentionally has no settings or staff-security dependency. */
export function createNativePushTokenCipherFromEnv(raw = process.env.NATIVE_PUSH_TOKEN_KEYRING_JSON): NativePushTokenCipher {
  if (!raw) throw new Error('native_push_token_keyring_unavailable');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('native_push_token_keyring_invalid'); }
  if (!parsed || typeof parsed !== 'object') throw new Error('native_push_token_keyring_invalid');
  const record = parsed as Record<string, unknown>;
  const activeKeyId = typeof record.activeKeyId === 'string' ? record.activeKeyId : '';
  const keys = record.keys && typeof record.keys === 'object' ? record.keys as Record<string, unknown> : {};
  const keyFor = (id: string): Buffer => {
    const encoded = keys[id];
    if (typeof encoded !== 'string') throw new Error('native_push_token_key_missing');
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32) throw new Error('native_push_token_key_invalid');
    return key;
  };
  return {
    encrypt(token, context) { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', keyFor(activeKeyId), iv); cipher.setAAD(aad(context)); const body = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]); return { keyId: activeKeyId, ciphertext: Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url') }; },
    decrypt(ciphertext, keyId, context) { const data = Buffer.from(ciphertext, 'base64url'); if (data.length < 29) throw new Error('native_push_token_ciphertext_invalid'); const decipher = createDecipheriv('aes-256-gcm', keyFor(keyId), data.subarray(0, 12)); decipher.setAAD(aad(context)); decipher.setAuthTag(data.subarray(12, 28)); return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8'); },
  };
}
