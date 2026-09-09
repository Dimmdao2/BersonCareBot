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
  return cap?.isNativePlatform?.() === true;
}

function plugin(name: 'ShellRuntime' | 'UniversalPush' | 'App'): CapacitorPluginCallable | null {
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
  const push = plugin('UniversalPush');
  if (!push || typeof push.configure !== 'function') return false;
  try {
    await push.configure({ projectId });
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
