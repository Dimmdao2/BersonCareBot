/**
 * #915 auditor-live oracle for the native Push keyring bootstrap
 * (`.lead/runs/mobile-native-push-wire-confirmation-audit-20260909/00-blind-killset.md` K18/K19/K20).
 *
 * Failure caught: `buildAppDeps.ts` calls this factory unconditionally at module scope. Before
 * `fd3f6a3b5`, the equivalent call (`createNativePushTokenCipherFromEnv()`) threw
 * `native_push_token_keyring_unavailable` whenever `NATIVE_PUSH_TOKEN_KEYRING_JSON` was absent —
 * an environment with no native-push keyring configured (any deployment that hasn't opted into
 * native mobile Push yet) could not bootstrap the app at all, not just native Push registration.
 */
import { describe, expect, it } from 'vitest';
import {
  createNativePushTokenCipherFromEnv,
  createOptionalNativePushTokenCipherFromEnv,
} from './nativePush';

describe('native Push keyring bootstrap — M6-01/M6-11', () => {
  it('returns null instead of throwing when the keyring env var is absent', () => {
    expect(() => createOptionalNativePushTokenCipherFromEnv(undefined)).not.toThrow();
    expect(createOptionalNativePushTokenCipherFromEnv(undefined)).toBeNull();
    expect(createOptionalNativePushTokenCipherFromEnv('')).toBeNull();
  });

  it('still throws (a real config error, not the absent-keyring degrade) when the env var is present but malformed', () => {
    expect(() => createOptionalNativePushTokenCipherFromEnv('not-json')).toThrow(
      'native_push_token_keyring_invalid',
    );
  });

  it('returns a working cipher when the keyring is configured (no accidental universal skip)', () => {
    const raw = JSON.stringify({
      activeKeyId: 'k1',
      keys: { k1: Buffer.alloc(32, 7).toString('base64') },
    });
    const cipher = createOptionalNativePushTokenCipherFromEnv(raw);
    expect(cipher).not.toBeNull();
    const context = {
      userId: 'u1',
      appId: 'therapygo' as const,
      provider: 'rustore' as const,
      installationIdHash: 'hash1',
    };
    const { ciphertext, keyId } = cipher!.encrypt('secret-token', context);
    expect(cipher!.decrypt(ciphertext, keyId, context)).toBe('secret-token');
  });

  it('the throwing factory it wraps still throws directly on absent env (regression guard for the wrapper itself)', () => {
    expect(() => createNativePushTokenCipherFromEnv(undefined)).toThrow(
      'native_push_token_keyring_unavailable',
    );
  });
});
