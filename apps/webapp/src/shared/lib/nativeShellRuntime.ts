/**
 * The ONE adapter allowed to read `window.Capacitor` / call `ShellRuntime` / `UniversalPush` (M3-01).
 * Product pages/components never import Capacitor globals directly — they consume
 * `NativeRuntimeSnapshot` from `PlatformProvider`/`useNativeRuntime()` (types in `platform.ts`) or the
 * typed wrapper functions exported here. Every native call validates the returned JSON at runtime and
 * fails back to `BROWSER_NATIVE_RUNTIME` / no-op on an absent plugin, a rejection, a malformed shape or
 * an untrusted/browser page — never a white screen (M3-03).
 *
 * Contract source: `apps/mobile-shell/README.md` (`ShellRuntimeInfo`, `UniversalPush` wire) and
 * `apps/mobile-shell/src/runtime-info.ts`. The shell auto-injects `window.Capacitor` into the trusted
 * WebView; the remote webapp bundles no `@capacitor/core` — only this file reads the global.
 */
import { BROWSER_NATIVE_RUNTIME, type NativeRuntimeKind, type NativeRuntimeSnapshot } from '@/shared/lib/platform';

type CapacitorPluginCallable = Record<string, (...args: unknown[]) => Promise<unknown>>;

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, CapacitorPluginCallable | undefined>;
};

function capacitorGlobal(): CapacitorGlobal | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { Capacitor?: CapacitorGlobal };
  return w.Capacitor ?? null;
}

/**
 * Cheap synchronous "are we inside the Capacitor shell at all" check — always available, not gated by
 * `TrustedOriginGate`. Used by the PWA/service-worker/install chokepoints (M1-07): they must suppress
 * browser-only behavior regardless of whether the richer async `ShellRuntimeInfo` has resolved yet.
 */
export function isNativeShellActive(): boolean {
  const cap = capacitorGlobal();
  try {
    return cap?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

function plugin(
  name: 'ShellRuntime' | 'UniversalPush' | 'App' | 'DeviceMedia' | 'NativeJitsi',
): CapacitorPluginCallable | null {
  const cap = capacitorGlobal();
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.[name] ?? null;
}

type RawShellRuntimeInfo = {
  kind?: unknown;
  version?: unknown;
  brand?: unknown;
  capabilities?: unknown;
};

function isBooleanCapabilities(value: unknown): value is { jitsi: boolean; media: boolean; push: boolean } {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return typeof c.jitsi === 'boolean' && typeof c.media === 'boolean' && typeof c.push === 'boolean';
}

function mapBrandToKind(brand: unknown): NativeRuntimeKind | null {
  if (brand === 'therapygo') return 'therapygo_android';
  if (brand === 'therapysto') return 'therapysto_android';
  return null;
}

function validateShellRuntimeInfo(raw: unknown): NativeRuntimeSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const info = raw as RawShellRuntimeInfo;
  if (info.kind !== 'capacitor-android') return null;
  const kind = mapBrandToKind(info.brand);
  if (!kind) return null;
  if (typeof info.version !== 'string' || info.version.length === 0) return null;
  if (!isBooleanCapabilities(info.capabilities)) return null;
  return {
    kind,
    version: info.version,
    capabilities: {
      jitsi: info.capabilities.jitsi,
      media: info.capabilities.media,
      push: info.capabilities.push,
    },
  };
}

/**
 * Async, trust-gated: resolves the confirmed `{kind, version, capabilities}` fact from the native
 * `ShellRuntime` plugin. Never throws — an absent plugin, a rejection (untrusted origin) or a malformed
 * shape all resolve to the browser-safe default.
 */
export async function detectNativeRuntimeSnapshot(): Promise<NativeRuntimeSnapshot> {
  const shellRuntime = plugin('ShellRuntime');
  if (!shellRuntime || typeof shellRuntime.getRuntimeInfo !== 'function') return BROWSER_NATIVE_RUNTIME;
  try {
    const raw = await shellRuntime.getRuntimeInfo();
    return validateShellRuntimeInfo(raw) ?? BROWSER_NATIVE_RUNTIME;
  } catch {
    return BROWSER_NATIVE_RUNTIME;
  }
}

/** Non-secret project id only — validated by the caller before being passed here (M6-08/M6-09). */
export async function configureUniversalPush(projectId: string): Promise<boolean> {
  const normalizedProjectId = projectId.trim();
  if (!normalizedProjectId) return false;
  const push = plugin('UniversalPush');
  if (!push || typeof push.configure !== 'function') return false;
  try {
    await push.configure({ projectId: normalizedProjectId });
    return true;
  } catch {
    return false;
  }
}

export async function requestUniversalPushPermission(): Promise<'granted' | 'denied' | 'unavailable'> {
  const push = plugin('UniversalPush');
  if (!push || typeof push.requestPermission !== 'function') return 'unavailable';
  try {
    const result = (await push.requestPermission()) as { permission?: unknown } | null;
    return result?.permission === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}

export type UniversalPushState = { available: boolean; permission: 'granted' | 'denied'; token: string | null };

export async function getUniversalPushState(): Promise<UniversalPushState | null> {
  const push = plugin('UniversalPush');
  if (!push || typeof push.getState !== 'function') return null;
  try {
    const raw = (await push.getState()) as Record<string, unknown> | null;
    if (!raw || typeof raw.available !== 'boolean') return null;
    const permission = raw.permission === 'granted' ? 'granted' : 'denied';
    const token = typeof raw.token === 'string' && raw.token.length > 0 ? raw.token : null;
    return { available: raw.available, permission, token };
  } catch {
    return null;
  }
}

/** Best-effort: deletes only the provider token, never blocks the caller (logout door, M3-03). */
export async function revokeUniversalPush(): Promise<void> {
  const push = plugin('UniversalPush');
  if (!push || typeof push.revoke !== 'function') return;
  try {
    await push.revoke();
  } catch {
    /* best-effort */
  }
}

export type NativePushTapEvent = { pushSurface: string; notificationKind: string; route: string };

function isTapEvent(raw: unknown): raw is { event: 'tap' } & NativePushTapEvent {
  if (!raw || typeof raw !== 'object') return false;
  const e = raw as Record<string, unknown>;
  return (
    e.event === 'tap' &&
    typeof e.pushSurface === 'string' &&
    typeof e.notificationKind === 'string' &&
    typeof e.route === 'string'
  );
}

export type NativePushListenerEvent =
  | { kind: 'tap'; tap: NativePushTapEvent }
  | { kind: 'token'; token: string }
  | { kind: 'other' };

function classifyPushEvent(raw: unknown): NativePushListenerEvent {
  if (isTapEvent(raw)) {
    return { kind: 'tap', tap: { pushSurface: raw.pushSurface, notificationKind: raw.notificationKind, route: raw.route } };
  }
  if (raw && typeof raw === 'object') {
    const e = raw as Record<string, unknown>;
    if (typeof e.token === 'string' && e.token.length > 0) return { kind: 'token', token: e.token };
  }
  return { kind: 'other' };
}

/** Registers exactly one `push` listener per call; returns an unsubscribe function (no-op if plugin absent). */
export function addUniversalPushListener(onEvent: (event: NativePushListenerEvent) => void): () => void {
  const push = plugin('UniversalPush');
  if (!push || typeof push.addListener !== 'function') return () => {};
  let removed = false;
  let handle: { remove: () => void } | null = null;
  void push
    .addListener('push', (raw: unknown) => onEvent(classifyPushEvent(raw)))
    .then((h) => {
      if (removed) {
        void (h as { remove?: () => void })?.remove?.();
        return;
      }
      handle = h as { remove: () => void };
    })
    .catch(() => {});
  return () => {
    removed = true;
    handle?.remove?.();
  };
}

// ---------------------------------------------------------------------------
// NativeJitsi (M4-01): the browser-facing half of the already accepted Android
// plugin. This adapter owns all plugin shape validation and listener cleanup;
// product pages keep using the provider-neutral VideoMeetingStage contract.
// ---------------------------------------------------------------------------

export type NativeJitsiConferenceEvent =
  | { state: 'joined'; conferenceId: string | null }
  | { state: 'terminated'; conferenceId: string | null }
  | { state: 'error'; code: string | null; conferenceId: string | null };

export type NativeJitsiStartOutcome = {
  state: 'started' | 'permission_denied' | 'launch_failed' | 'unavailable';
  conferenceId: string | null;
};

function nativeJitsiPlugin(): CapacitorPluginCallable | null {
  return plugin('NativeJitsi');
}

function nativeJitsiOutcome(raw: unknown): NativeJitsiStartOutcome {
  if (!raw || typeof raw !== 'object') return { state: 'unavailable', conferenceId: null };
  const value = raw as Record<string, unknown>;
  const state = value.state;
  const conferenceId = typeof value.conferenceId === 'string' && value.conferenceId.length > 0
    ? value.conferenceId
    : null;
  return state === 'started' || state === 'permission_denied' || state === 'launch_failed'
    ? { state, conferenceId }
    : { state: 'unavailable', conferenceId: null };
}

function nativeJitsiConferenceEvent(raw: unknown): NativeJitsiConferenceEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const event = raw as Record<string, unknown>;
  const conferenceId = typeof event.conferenceId === 'string' && event.conferenceId.length > 0
    ? event.conferenceId
    : null;
  if (event.state === 'joined' || event.state === 'terminated') return { state: event.state, conferenceId };
  if (event.state === 'error') {
    return { state: 'error', code: typeof event.code === 'string' ? event.code : null, conferenceId };
  }
  return null;
}

/** Starts the native Activity with the already-authorized render session. It never logs or persists it. */
export async function startNativeJitsi(input: {
  endpoint: string;
  roomReference: string;
  accessToken: string;
}): Promise<NativeJitsiStartOutcome> {
  const nativeJitsi = nativeJitsiPlugin();
  if (!nativeJitsi || typeof nativeJitsi.start !== 'function') return { state: 'unavailable', conferenceId: null };
  try {
    return nativeJitsiOutcome(await nativeJitsi.start(input));
  } catch {
    return { state: 'unavailable', conferenceId: null };
  }
}

/** Retries only the plugin-owned terminal conference; the token remains inside the native plugin. */
export async function retryNativeJitsi(): Promise<NativeJitsiStartOutcome> {
  const nativeJitsi = nativeJitsiPlugin();
  if (!nativeJitsi || typeof nativeJitsi.retry !== 'function') return { state: 'unavailable', conferenceId: null };
  try {
    return nativeJitsiOutcome(await nativeJitsi.retry());
  } catch {
    return { state: 'unavailable', conferenceId: null };
  }
}

/** Best-effort and idempotent on the Android side. Used only by the renderer that started the conference. */
export async function hangupNativeJitsi(): Promise<void> {
  const nativeJitsi = nativeJitsiPlugin();
  if (!nativeJitsi || typeof nativeJitsi.hangup !== 'function') return;
  try {
    await nativeJitsi.hangup();
  } catch {
    /* The Activity may already have returned. */
  }
}

/** Registers one native conference listener and makes removal safe even when registration resolves late. */
export function addNativeJitsiConferenceListener(
  onEvent: (event: NativeJitsiConferenceEvent) => void,
): () => void {
  const nativeJitsi = nativeJitsiPlugin();
  if (!nativeJitsi || typeof nativeJitsi.addListener !== 'function') return () => {};
  let removed = false;
  let handle: { remove: () => void } | null = null;
  void nativeJitsi
    .addListener('conference', (raw: unknown) => {
      if (removed) return;
      const event = nativeJitsiConferenceEvent(raw);
      if (event) onEvent(event);
    })
    .then((listenerHandle) => {
      const candidate = listenerHandle as { remove?: () => void } | null;
      if (removed) {
        candidate?.remove?.();
        return;
      }
      if (typeof candidate?.remove === 'function') handle = { remove: candidate.remove.bind(candidate) };
    })
    .catch(() => {});
  return () => {
    removed = true;
    handle?.remove();
  };
}

// ---------------------------------------------------------------------------
// DeviceMedia (M5-01): camera/gallery/document capture + streamed native upload.
// Contract source: `apps/mobile-shell/README.md` (`DeviceMedia` row) — the plugin never hands a
// content URI or raw bytes to JS, only an opaque `handle` plus non-secret descriptor fields.
// ---------------------------------------------------------------------------

export type NativeDeviceMediaKind = 'photo' | 'video' | 'document';
export type NativeDeviceMediaSource = 'camera' | 'gallery' | 'document';

export type NativeDeviceMediaSelection = {
  outcome: 'selected';
  handle: string;
  mimeType: string;
  displayName: string;
  sizeBytes: number;
  durationSeconds: number | null;
  source: NativeDeviceMediaSource;
  kind: NativeDeviceMediaKind;
};

export type NativeDeviceMediaCancelled = { outcome: 'cancelled' };

/** `null` means the call itself could not reach the plugin (absent/rejected/malformed) — the
 * caller falls back to the browser picker exactly like an absent `ShellRuntime` falls back to
 * `BROWSER_NATIVE_RUNTIME`. A user-visible cancel is `{outcome:'cancelled'}`, never `null`. */
export type NativeDeviceMediaOutcome = NativeDeviceMediaSelection | NativeDeviceMediaCancelled;

function isNativeDeviceMediaKind(value: unknown): value is NativeDeviceMediaKind {
  return value === 'photo' || value === 'video' || value === 'document';
}

function isNativeDeviceMediaSource(value: unknown): value is NativeDeviceMediaSource {
  return value === 'camera' || value === 'gallery' || value === 'document';
}

function validateDeviceMediaOutcome(raw: unknown): NativeDeviceMediaOutcome | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.outcome === 'cancelled') return { outcome: 'cancelled' };
  if (r.outcome !== 'selected') return null;
  if (
    typeof r.handle !== 'string' ||
    r.handle.length === 0 ||
    typeof r.mimeType !== 'string' ||
    typeof r.displayName !== 'string' ||
    typeof r.sizeBytes !== 'number' ||
    !Number.isFinite(r.sizeBytes) ||
    r.sizeBytes < 0 ||
    !isNativeDeviceMediaSource(r.source) ||
    !isNativeDeviceMediaKind(r.kind)
  ) {
    return null;
  }
  const durationSeconds =
    typeof r.durationSeconds === 'number' && Number.isFinite(r.durationSeconds) && r.durationSeconds > 0
      ? r.durationSeconds
      : null;
  return {
    outcome: 'selected',
    handle: r.handle,
    mimeType: r.mimeType,
    displayName: r.displayName,
    sizeBytes: r.sizeBytes,
    durationSeconds,
    source: r.source,
    kind: r.kind,
  };
}

async function callDeviceMedia(
  method: 'captureMedia' | 'pickMedia' | 'pickDocument',
  args: Record<string, unknown>,
): Promise<NativeDeviceMediaOutcome | null> {
  const deviceMedia = plugin('DeviceMedia');
  if (!deviceMedia || typeof deviceMedia[method] !== 'function') return null;
  try {
    const raw = await deviceMedia[method](args);
    return validateDeviceMediaOutcome(raw);
  } catch {
    return null;
  }
}

/** Opens the native CameraX screen; the user can still switch Photo/Video inside it (M5-02). */
export function captureNativeDeviceMedia(kind: 'photo' | 'video'): Promise<NativeDeviceMediaOutcome | null> {
  return callDeviceMedia('captureMedia', { kind });
}

/** System gallery picker (images and videos together, M5-03). */
export function pickNativeDeviceMedia(opts?: {
  requiresDuration?: boolean;
}): Promise<NativeDeviceMediaOutcome | null> {
  return callDeviceMedia('pickMedia', opts?.requiresDuration ? { requiresDuration: true } : {});
}

/** System document picker with a narrow, natively-enforced MIME allowlist (M5-03). */
export function pickNativeDeviceDocument(mimeTypes: string[]): Promise<NativeDeviceMediaOutcome | null> {
  return callDeviceMedia('pickDocument', { mimeTypes });
}

export type NativeDeviceMediaUploadResult =
  | { outcome: 'uploaded'; status: number; etag: string }
  | { outcome: 'upload_failed'; status: number };

function validateDeviceMediaUploadResult(raw: unknown): NativeDeviceMediaUploadResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.outcome === 'uploaded' && typeof r.status === 'number' && typeof r.etag === 'string' && r.etag) {
    return { outcome: 'uploaded', status: r.status, etag: r.etag };
  }
  if (r.outcome === 'upload_failed' && typeof r.status === 'number') {
    return { outcome: 'upload_failed', status: r.status };
  }
  return null;
}

/**
 * Streams one exact byte range of an already-picked native handle to an already-authorized
 * presigned URL (M5-04). The plugin permits exactly one call in flight at a time — callers must
 * serialize (never call this concurrently for the same or a different handle).
 */
export async function uploadNativeDeviceMediaRange(input: {
  handle: string;
  offset: number;
  length: number;
  presignedUrl: string;
  headers: Record<string, string>;
}): Promise<NativeDeviceMediaUploadResult | null> {
  const deviceMedia = plugin('DeviceMedia');
  if (!deviceMedia || typeof deviceMedia.upload !== 'function') return null;
  try {
    const raw = await deviceMedia.upload(input);
    return validateDeviceMediaUploadResult(raw);
  } catch {
    return null;
  }
}

/** Best-effort: asks the plugin to abort whatever range upload is currently in flight. */
export async function cancelNativeDeviceMediaUpload(): Promise<void> {
  const deviceMedia = plugin('DeviceMedia');
  if (!deviceMedia || typeof deviceMedia.cancelUpload !== 'function') return;
  try {
    await deviceMedia.cancelUpload();
  } catch {
    /* best-effort */
  }
}

/** Releases the native handle exactly once a terminal (success/abort/cancel) outcome is reached. */
export async function releaseNativeDeviceMediaHandle(handle: string): Promise<void> {
  const deviceMedia = plugin('DeviceMedia');
  if (!deviceMedia || typeof deviceMedia.release !== 'function') return;
  try {
    await deviceMedia.release({ handle });
  } catch {
    /* best-effort */
  }
}

/**
 * Best-available app-resume signal without touching Android/Gradle: Capacitor's core `App` plugin
 * (bundled with `capacitor-android`, no extra native registration) if present, else no-op — callers
 * additionally listen to `visibilitychange`/`focus` themselves as the universal fallback.
 */
export function addNativeAppResumeListener(onResume: () => void): () => void {
  const app = plugin('App');
  if (!app || typeof app.addListener !== 'function') return () => {};
  let removed = false;
  let handle: { remove: () => void } | null = null;
  void app
    .addListener('resume', () => onResume())
    .then((h) => {
      if (removed) {
        void (h as { remove?: () => void })?.remove?.();
        return;
      }
      handle = h as { remove: () => void };
    })
    .catch(() => {});
  return () => {
    removed = true;
    handle?.remove?.();
  };
}
