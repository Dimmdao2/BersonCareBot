/**
 * K3 — the shared PWA/service-worker doors are no-ops inside the Capacitor native shell (M1-07):
 * `registerPatientServiceWorker` never registers `/sw.js`, and `pushCapability`'s browser-PushManager
 * probes never resolve as supported. Named поломка: if either door forgot the native-shell gate, the app
 * would register a service worker / probe PushManager inside a WebView that has no such browser API
 * surface behind it, or — worse — leave a stale registration racing the native push transport. Browser
 * behavior must stay byte-for-byte unchanged (regression half of the check).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const nativeActive = vi.hoisted(() => ({ current: false }));
vi.mock('@/shared/lib/nativeShellRuntime', () => ({
  isNativeShellActive: () => nativeActive.current,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  nativeActive.current = false;
});

function stubBrowserGlobals() {
  const registerMock = vi.fn().mockResolvedValue({ active: true, pushManager: {} });
  vi.stubGlobal('window', { setTimeout, Notification: {}, PushManager: {} });
  vi.stubGlobal('navigator', { serviceWorker: { register: registerMock, getRegistration: vi.fn().mockResolvedValue(undefined) } });
  return registerMock;
}

describe('registerPatientServiceWorker — native shell no-op vs browser unchanged', () => {
  it('never calls navigator.serviceWorker.register() when the native shell is active', async () => {
    const registerMock = stubBrowserGlobals();
    nativeActive.current = true;
    const { registerPatientServiceWorker } = await import('./registerPatientServiceWorker');

    const result = await registerPatientServiceWorker();

    expect(result).toBeNull();
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('registers /sw.js normally in the browser (unchanged)', async () => {
    const registerMock = stubBrowserGlobals();
    nativeActive.current = false;
    const { registerPatientServiceWorker } = await import('./registerPatientServiceWorker');

    await registerPatientServiceWorker();

    expect(registerMock).toHaveBeenCalledWith('/sw.js', expect.objectContaining({ scope: expect.any(String) }));
  });
});

describe('pushCapability — native shell probes stay false, no SW touched', () => {
  it('probePushSupported() is false in native shell without touching serviceWorker.getRegistration', async () => {
    const registerMock = stubBrowserGlobals();
    nativeActive.current = true;
    const { probePushSupported } = await import('./pushCapability');

    await expect(probePushSupported()).resolves.toBe(false);
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('getServiceWorkerRegistration() is null in native shell', async () => {
    stubBrowserGlobals();
    nativeActive.current = true;
    const { getServiceWorkerRegistration } = await import('./pushCapability');

    await expect(getServiceWorkerRegistration()).resolves.toBeNull();
  });

  it('getExistingPushSubscription() is null in native shell', async () => {
    stubBrowserGlobals();
    nativeActive.current = true;
    const { getExistingPushSubscription } = await import('./pushCapability');

    await expect(getExistingPushSubscription()).resolves.toBeNull();
  });

  it('probePushSupported() stays true in the browser when PushManager is present (unchanged)', async () => {
    stubBrowserGlobals();
    nativeActive.current = false;
    const { probePushSupported } = await import('./pushCapability');

    await expect(probePushSupported()).resolves.toBe(true);
  });
});
