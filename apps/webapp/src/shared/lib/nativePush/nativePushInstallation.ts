/**
 * One opaque installation id per installed app, persisted client-side with the repo's established
 * localStorage convention (module-level key constant, every access wrapped in try/catch — see
 * `shared/lib/webPush/pushPromptStorage.ts` / `shared/lib/pwa/staffPwaInstallState.ts`). Never a user id,
 * role or org id (M3-03/M6-01) — a fresh random id if none is stored yet.
 */
import type { NativeRuntimeKind } from '@/shared/lib/platform';

const INSTALLATION_ID_STORAGE_PREFIX = 'bersoncare.nativePushInstallationId.';
const LAST_SYNCED_TOKEN_HASH_STORAGE_PREFIX = 'bersoncare.nativePushLastSyncedTokenHash.';

function installationIdKey(kind: NativeRuntimeKind): string {
  return `${INSTALLATION_ID_STORAGE_PREFIX}${kind}.v1`;
}

function lastSyncedTokenHashKey(kind: NativeRuntimeKind): string {
  return `${LAST_SYNCED_TOKEN_HASH_STORAGE_PREFIX}${kind}.v1`;
}

export function getOrCreateNativePushInstallationId(kind: NativeRuntimeKind): string | null {
  if (typeof window === 'undefined') return null;
  const key = installationIdKey(kind);
  try {
    const existing = window.localStorage.getItem(key);
    if (existing?.trim()) return existing;
  } catch {
    return null;
  }
  let generated: string;
  try {
    generated = crypto.randomUUID();
  } catch {
    return null;
  }
  try {
    window.localStorage.setItem(key, generated);
  } catch {
    /* quota / private mode — still usable for this session */
  }
  return generated;
}

export function readNativePushInstallationId(kind: NativeRuntimeKind): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(installationIdKey(kind));
  } catch {
    return null;
  }
}

/** Cheap dedupe so token-rotation/resume events don't storm the register endpoint (M3-03). */
export function readLastSyncedTokenHash(kind: NativeRuntimeKind): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(lastSyncedTokenHashKey(kind));
  } catch {
    return null;
  }
}

export function writeLastSyncedTokenHash(kind: NativeRuntimeKind, hash: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(lastSyncedTokenHashKey(kind), hash);
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearLastSyncedTokenHash(kind: NativeRuntimeKind): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(lastSyncedTokenHashKey(kind));
  } catch {
    /* ignore */
  }
}

/** Cheap non-secret dedupe hash — not a security boundary, just avoids POSTing an identical token again. */
export async function shortTokenFingerprint(token: string): Promise<string> {
  try {
    const data = new TextEncoder().encode(token);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest).subarray(0, 12))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    // Distinguish equal-length rotations without persisting or logging the raw token when SubtleCrypto is absent.
    let hashA = 0x811c9dc5;
    let hashB = 0x9e3779b9;
    for (let index = 0; index < token.length; index += 1) {
      const code = token.charCodeAt(index);
      hashA = Math.imul(hashA ^ code, 0x01000193);
      hashB = Math.imul(hashB ^ code, 0x85ebca6b);
    }
    const hexA = (hashA >>> 0).toString(16).padStart(8, '0');
    const hexB = (hashB >>> 0).toString(16).padStart(8, '0');
    return `fallback:${hexA}${hexB}:${token.length}`;
  }
}
