/**
 * `nativeShellRuntime.ts` is the ONE adapter allowed to read `window.Capacitor` (M3-01). Named poломки:
 *
 * K1 — an absent plugin, a rejecting/throwing `getRuntimeInfo`, or any malformed JSON shape from the
 *      native bridge must resolve to `BROWSER_NATIVE_RUNTIME`, never throw and never leave the caller
 *      believing it runs native when it does not (a false-native snapshot could unlock native-only UI/
 *      push flow with nothing behind it — dorogoy i tikhiy otkaz). The synchronous `isNativeShellActive()`
 *      chokepoint (gates PWA/service-worker/install doors, M1-07) carries the same contract: a bridge that
 *      throws synchronously must not crash the caller either.
 * K2 — only `brand==='therapygo'`/`'therapysto'` map to a closed kind; any other brand string (typo,
 *      cross-brand, unexpected value) must fall back to browser, not silently pick a brand.
 * K5 continuation — `configureUniversalPush` never forwards a blank/whitespace project id to the native
 *      plugin (a project id is not a secret, but an empty one would still misconfigure the provider on the
 *      next explicit enable action).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BROWSER_NATIVE_RUNTIME } from '@/shared/lib/platform';
import { configureUniversalPush, detectNativeRuntimeSnapshot, isNativeShellActive } from './nativeShellRuntime';

type FakeCapacitor = {
  isNativePlatform: () => boolean;
  Plugins?: {
    ShellRuntime?: { getRuntimeInfo: () => Promise<unknown> };
    UniversalPush?: { configure: (input: { projectId: string }) => Promise<unknown> };
  };
};

function stubCapacitor(cap: FakeCapacitor | undefined): void {
  vi.stubGlobal('window', cap === undefined ? {} : { Capacitor: cap });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const VALID_CAPS = { jitsi: true, media: true, push: true };

describe('isNativeShellActive', () => {
  it('is false without window.Capacitor and true only when isNativePlatform() is true', () => {
    stubCapacitor(undefined);
    expect(isNativeShellActive()).toBe(false);

    stubCapacitor({ isNativePlatform: () => false });
    expect(isNativeShellActive()).toBe(false);

    stubCapacitor({ isNativePlatform: () => true });
    expect(isNativeShellActive()).toBe(true);
  });

  it('returns false instead of throwing when the bridge call itself throws synchronously', () => {
    stubCapacitor({
      isNativePlatform: () => {
        throw new Error('bridge not ready');
      },
    });
    expect(() => isNativeShellActive()).not.toThrow();
    expect(isNativeShellActive()).toBe(false);
  });
});

describe('detectNativeRuntimeSnapshot — K1 safe fallback', () => {
  it('falls back to browser when there is no Capacitor global at all', async () => {
    stubCapacitor(undefined);
    await expect(detectNativeRuntimeSnapshot()).resolves.toEqual(BROWSER_NATIVE_RUNTIME);
  });

  it('falls back to browser when the plugin is not registered', async () => {
    stubCapacitor({ isNativePlatform: () => true, Plugins: {} });
    await expect(detectNativeRuntimeSnapshot()).resolves.toEqual(BROWSER_NATIVE_RUNTIME);
  });

  it('falls back to browser when the native call rejects (untrusted origin)', async () => {
    stubCapacitor({
      isNativePlatform: () => true,
      Plugins: { ShellRuntime: { getRuntimeInfo: () => Promise.reject(new Error('untrusted origin')) } },
    });
    await expect(detectNativeRuntimeSnapshot()).resolves.toEqual(BROWSER_NATIVE_RUNTIME);
  });

  it.each([
    ['wrong kind literal', { kind: 'not-capacitor-android', brand: 'therapygo', version: '1.0', capabilities: VALID_CAPS }],
    ['missing version', { kind: 'capacitor-android', brand: 'therapygo', capabilities: VALID_CAPS }],
    ['empty version', { kind: 'capacitor-android', brand: 'therapygo', version: '', capabilities: VALID_CAPS }],
    ['non-boolean capability', { kind: 'capacitor-android', brand: 'therapygo', version: '1.0', capabilities: { jitsi: 'yes', media: true, push: true } }],
    ['missing capabilities', { kind: 'capacitor-android', brand: 'therapygo', version: '1.0' }],
    ['null payload', null],
    ['array payload', []],
    ['string payload', 'capacitor-android'],
  ])('falls back to browser on malformed shape: %s', async (_label, raw) => {
    stubCapacitor({
      isNativePlatform: () => true,
      Plugins: { ShellRuntime: { getRuntimeInfo: () => Promise.resolve(raw) } },
    });
    await expect(detectNativeRuntimeSnapshot()).resolves.toEqual(BROWSER_NATIVE_RUNTIME);
  });
});

describe('detectNativeRuntimeSnapshot — K2 closed brand→kind mapping', () => {
  it.each([
    ['therapygo', 'therapygo_android'],
    ['therapysto', 'therapysto_android'],
  ] as const)('maps brand %s to kind %s', async (brand, kind) => {
    stubCapacitor({
      isNativePlatform: () => true,
      Plugins: {
        ShellRuntime: {
          getRuntimeInfo: () => Promise.resolve({ kind: 'capacitor-android', brand, version: '1.2.3', capabilities: VALID_CAPS }),
        },
      },
    });
    await expect(detectNativeRuntimeSnapshot()).resolves.toEqual({ kind, version: '1.2.3', capabilities: VALID_CAPS });
  });

  it.each(['therapygo_typo', 'THERAPYGO', 'therapysto_admin', '', 'admin', 'browser'])(
    'rejects an unrecognized brand and falls back to browser: %s',
    async (brand) => {
      stubCapacitor({
        isNativePlatform: () => true,
        Plugins: {
          ShellRuntime: {
            getRuntimeInfo: () => Promise.resolve({ kind: 'capacitor-android', brand, version: '1.0', capabilities: VALID_CAPS }),
          },
        },
      });
      await expect(detectNativeRuntimeSnapshot()).resolves.toEqual(BROWSER_NATIVE_RUNTIME);
    },
  );
});

describe('configureUniversalPush — blank project id never reaches the plugin', () => {
  it.each(['', '   ', '\t\n'])('rejects without calling UniversalPush.configure: %j', async (projectId) => {
    const configureMock = vi.fn().mockResolvedValue(undefined);
    stubCapacitor({ isNativePlatform: () => true, Plugins: { UniversalPush: { configure: configureMock } } });

    await expect(configureUniversalPush(projectId)).resolves.toBe(false);
    expect(configureMock).not.toHaveBeenCalled();
  });

  it('trims and forwards a non-blank project id', async () => {
    const configureMock = vi.fn().mockResolvedValue(undefined);
    stubCapacitor({ isNativePlatform: () => true, Plugins: { UniversalPush: { configure: configureMock } } });

    await expect(configureUniversalPush('  proj-1  ')).resolves.toBe(true);
    expect(configureMock).toHaveBeenCalledWith({ projectId: 'proj-1' });
  });
});
