/**
 * One typed native-push client bootstrap over the accepted `/api/patient/native-push` and
 * `/api/account/native-push` routes (M3-03/M6-03/M6-09). Reuses `SubscribePatientWebPushResult`'s
 * failure-reason vocabulary (and its existing `webPushSubscribeFailureMessage` copy) so callers don't
 * invent a second message resolver — see `AGENTS.md` §21 (no new UI copy) and §5 (one chokepoint).
 */
import type { NativeRuntimeKind } from '@/shared/lib/platform';
import {
  configureUniversalPush,
  getUniversalPushState,
  requestUniversalPushPermission,
  revokeUniversalPush,
} from '@/shared/lib/nativeShellRuntime';
import {
  fetchNativePushStatus,
  registerNativePushInstallation,
  revokeNativePushInstallation,
  type NativePushAppKind,
} from '@/shared/lib/nativePush/nativePushApi';
import {
  clearLastSyncedTokenHash,
  getOrCreateNativePushInstallationId,
  readLastSyncedTokenHash,
  readNativePushInstallationId,
  shortTokenFingerprint,
  writeLastSyncedTokenHash,
} from '@/shared/lib/nativePush/nativePushInstallation';

export type NativePushEnableResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'unsupported'
        | 'vapid_unavailable'
        | 'permission_denied'
        | 'permission_default'
        | 'save_failed'
        | 'error';
    };

async function persistToken(kind: NativePushAppKind, installationId: string, token: string): Promise<boolean> {
  const outcome = await registerNativePushInstallation(kind, { installationId, token });
  if (outcome !== 'ok') return false;
  writeLastSyncedTokenHash(kind, await shortTokenFingerprint(token));
  return true;
}

/** Explicit user-gesture flow: configure → request permission → persist token. Call only from a click handler. */
export async function enableNativePushSubscription(kind: NativePushAppKind): Promise<NativePushEnableResult> {
  const status = await fetchNativePushStatus(kind);
  if (!status || !status.projectId) return { ok: false, reason: 'vapid_unavailable' };

  const configured = await configureUniversalPush(status.projectId);
  if (!configured) return { ok: false, reason: 'error' };

  const permission = await requestUniversalPushPermission();
  if (permission === 'unavailable') return { ok: false, reason: 'unsupported' };
  if (permission === 'denied') return { ok: false, reason: 'permission_denied' };

  const state = await getUniversalPushState();
  if (!state?.token) return { ok: false, reason: 'error' };

  const installationId = getOrCreateNativePushInstallationId(kind);
  if (!installationId) return { ok: false, reason: 'error' };

  const saved = await persistToken(kind, installationId, state.token);
  return saved ? { ok: true } : { ok: false, reason: 'save_failed' };
}

/**
 * Idempotent, no permission prompt (M3-03: mount / app resume / already-granted reconcile). Skips the
 * POST entirely when the token is unchanged since the last sync, so resume/token events don't storm it.
 */
export async function reconcileNativePushSubscription(kind: NativePushAppKind): Promise<void> {
  const state = await getUniversalPushState();
  if (!state?.available || state.permission !== 'granted' || !state.token) return;
  await reconcileNativePushToken(kind, state.token);
}

/** Same dedupe path, driven by a `push` token-rotation event instead of a fresh `getState()` read. */
export async function reconcileNativePushToken(kind: NativePushAppKind, token: string): Promise<void> {
  const installationId = getOrCreateNativePushInstallationId(kind);
  if (!installationId) return;
  const hash = await shortTokenFingerprint(token);
  if (hash === readLastSyncedTokenHash(kind)) return;
  await persistToken(kind, installationId, token);
}

/** Explicit disable action (staff "Отключить" parity). Best-effort; always resolves. */
export async function disableNativePushSubscription(kind: NativePushAppKind): Promise<boolean> {
  const installationId = readNativePushInstallationId(kind);
  if (installationId) {
    await revokeNativePushInstallation(kind, { installationId });
  }
  await revokeUniversalPush();
  clearLastSyncedTokenHash(kind);
  return true;
}

/**
 * Logout door (M3-03): best-effort authenticated DELETE before session destruction, then plugin
 * `revoke()`. Never throws, never blocks logout — browser runtime and offboarding are untouched here;
 * offboarding stays server-owned.
 */
export async function revokeNativePushBeforeLogout(kind: NativeRuntimeKind): Promise<void> {
  if (kind === 'browser') return;
  const installationId = readNativePushInstallationId(kind);
  if (installationId) {
    await revokeNativePushInstallation(kind, { installationId });
  }
  await revokeUniversalPush();
}
