/**
 * `nativePushClient.ts` is the one typed native-push client bootstrap (M3-03/M6-03/M6-09 web-client half).
 * Named поломки:
 *
 * K4 — runtime kind alone fixes the route (`therapygo_android` → `/api/patient/native-push`,
 *      `therapysto_android` → `/api/account/native-push`); the caller cannot select it, and a missing
 *      project id / missing plugin / denied permission / bad server response fails typed, no throw, no
 *      retry loop.
 * K5 — token register/rotate is idempotent: an unchanged token (same fingerprint as the last synced one)
 *      does not re-POST, so a resume/token-event storm cannot hammer the endpoint.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

function fakeWindow() {
  const store = new Map<string, string>();
  return {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
}

vi.mock('@/shared/lib/nativeShellRuntime', () => ({
  configureUniversalPush: vi.fn(),
  getUniversalPushState: vi.fn(),
  requestUniversalPushPermission: vi.fn(),
  revokeUniversalPush: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

async function loadClient() {
  vi.stubGlobal('window', fakeWindow());
  const shell = await import('@/shared/lib/nativeShellRuntime');
  const client = await import('./nativePushClient');
  return { shell, client };
}

describe('nativePushClient — K4 runtime kind fixes the route', () => {
  it('registers against /api/patient/native-push for therapygo_android and never the staff route', async () => {
    const { shell, client } = await loadClient();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, active: false, providers: [], projectId: 'proj-1' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(shell.configureUniversalPush).mockResolvedValue(true);
    vi.mocked(shell.requestUniversalPushPermission).mockResolvedValue('granted');
    vi.mocked(shell.getUniversalPushState).mockResolvedValue({ available: true, permission: 'granted', token: 'tok-1' });

    const result = await client.enableNativePushSubscription('therapygo_android');

    expect(result).toEqual({ ok: true });
    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls.every((u) => u === '/api/patient/native-push')).toBe(true);
  });

  it('registers against /api/account/native-push for therapysto_android and never the patient route', async () => {
    const { shell, client } = await loadClient();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, active: false, providers: [], projectId: 'proj-2' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(shell.configureUniversalPush).mockResolvedValue(true);
    vi.mocked(shell.requestUniversalPushPermission).mockResolvedValue('granted');
    vi.mocked(shell.getUniversalPushState).mockResolvedValue({ available: true, permission: 'granted', token: 'tok-2' });

    await client.enableNativePushSubscription('therapysto_android');

    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls.every((u) => u === '/api/account/native-push')).toBe(true);
  });

  it('fails typed vapid_unavailable when the status route has no project id, without calling configure', async () => {
    const { shell, client } = await loadClient();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, active: false, providers: [], projectId: null }), { status: 200 })),
    );

    const result = await client.enableNativePushSubscription('therapygo_android');

    expect(result).toEqual({ ok: false, reason: 'vapid_unavailable' });
    expect(shell.configureUniversalPush).not.toHaveBeenCalled();
  });

  it('fails typed unsupported when the plugin reports permission unavailable (no plugin)', async () => {
    const { shell, client } = await loadClient();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, active: false, providers: [], projectId: 'proj-1' }), { status: 200 })),
    );
    vi.mocked(shell.configureUniversalPush).mockResolvedValue(true);
    vi.mocked(shell.requestUniversalPushPermission).mockResolvedValue('unavailable');

    await expect(client.enableNativePushSubscription('therapygo_android')).resolves.toEqual({
      ok: false,
      reason: 'unsupported',
    });
  });

  it('fails typed permission_denied without ever POSTing a token', async () => {
    const { shell, client } = await loadClient();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, active: false, providers: [], projectId: 'proj-1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(shell.configureUniversalPush).mockResolvedValue(true);
    vi.mocked(shell.requestUniversalPushPermission).mockResolvedValue('denied');

    const result = await client.enableNativePushSubscription('therapygo_android');

    expect(result).toEqual({ ok: false, reason: 'permission_denied' });
    expect(fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')).toHaveLength(0);
  });

  it('fails typed error on a malformed token event (no throw)', async () => {
    const { shell, client } = await loadClient();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, active: false, providers: [], projectId: 'proj-1' }), { status: 200 })),
    );
    vi.mocked(shell.configureUniversalPush).mockResolvedValue(true);
    vi.mocked(shell.requestUniversalPushPermission).mockResolvedValue('granted');
    vi.mocked(shell.getUniversalPushState).mockResolvedValue({ available: true, permission: 'granted', token: null });

    await expect(client.enableNativePushSubscription('therapygo_android')).resolves.toEqual({
      ok: false,
      reason: 'error',
    });
  });

  it('treats an unauthenticated (401-shaped ok:false/non-ok) status response as no active target, no throw', async () => {
    const { client } = await loadClient();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 })));

    await expect(client.enableNativePushSubscription('therapygo_android')).resolves.toEqual({
      ok: false,
      reason: 'vapid_unavailable',
    });
  });
});

describe('nativePushClient — K5 idempotent token sync, no POST storm', () => {
  it('does not re-POST an unchanged token across repeated resume/token events', async () => {
    const { shell, client } = await loadClient();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(shell.getUniversalPushState).mockResolvedValue({ available: true, permission: 'granted', token: 'stable-token' });

    // Simulates: mount reconcile, then two more resume/token events with the exact same token.
    await client.reconcileNativePushSubscription('therapygo_android');
    await client.reconcileNativePushToken('therapygo_android', 'stable-token');
    await client.reconcileNativePushToken('therapygo_android', 'stable-token');

    expect(fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')).toHaveLength(1);
  });

  it('does POST again once the token rotates to a genuinely new value', async () => {
    const { shell, client } = await loadClient();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(shell.getUniversalPushState).mockResolvedValue({ available: true, permission: 'granted', token: 'token-a' });

    await client.reconcileNativePushSubscription('therapygo_android');
    await client.reconcileNativePushToken('therapygo_android', 'token-b');

    expect(fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')).toHaveLength(2);
  });

  it('reconcile is a no-op (no fetch at all) when permission is not granted or no token is available', async () => {
    const { shell, client } = await loadClient();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(shell.getUniversalPushState).mockResolvedValue({ available: true, permission: 'denied', token: null });

    await client.reconcileNativePushSubscription('therapygo_android');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('nativePushClient — logout revoke is native-only and best-effort', () => {
  it('is a no-op for the browser runtime kind (never calls the native revoke path)', async () => {
    const { shell, client } = await loadClient();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await client.revokeNativePushBeforeLogout('browser');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(shell.revokeUniversalPush).not.toHaveBeenCalled();
  });
});
