/**
 * `nativePushClient.ts` is the one typed native-push client bootstrap (M3-03/M6-03/M6-09 web-client half).
 * Named поломки:
 *
 * K4 — runtime kind alone fixes the route (`therapygo_android` → `/api/patient/native-push`,
 *      `therapysto_android` → `/api/account/native-push`); the caller cannot select it, and a missing
 *      project id / missing plugin / denied permission / bad server response fails typed, no throw, no
 *      retry loop.
 * K5 — token register/rotate is idempotent: an unchanged token (same fingerprint as the last synced one)
 *      does not re-POST, so a resume/token-event storm cannot hammer the endpoint. Continuation classes
 *      added after `4e6a5b188` (concurrent, not just sequential, calls; fallback fingerprint collisions;
 *      logout/disable serialization and the post-logout re-registration regression; permission stays out
 *      of the mount/resume path):
 *      - genuinely concurrent mount/resume/token-event reconcile of the same token (started before any of
 *        them settles, not the earlier sequential-only proof) still produces exactly one POST;
 *      - when `crypto.subtle.digest` is unavailable, two different equal-length tokens still fingerprint
 *        differently (POST twice), never by comparing/logging the raw token;
 *      - logout/disable never lets its DELETE race ahead of an in-flight register, always clears the
 *        durable dedupe marker, and blocks a later lifecycle event in the same page — but a fresh
 *        module/session reload (the real effect of a page reload after login) re-registers the same
 *        device token for the newly authenticated user;
 *      - `requestUniversalPushPermission` is never reached from reconcile (mount/resume/token-event), only
 *        from the explicit `enableNativePushSubscription` action.
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

async function loadClient(win: ReturnType<typeof fakeWindow> = fakeWindow()) {
  vi.stubGlobal('window', win);
  const shell = await import('@/shared/lib/nativeShellRuntime');
  const client = await import('./nativePushClient');
  return { shell, client };
}

function postsOf(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
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

describe('nativePushClient — K5 continuation: genuinely concurrent reconcile, not sequential-only', () => {
  it('holds concurrent mount/resume/token-event reconcile of the same token to exactly one POST', async () => {
    const { shell, client } = await loadClient();
    let resolveRegisterPost: () => void = () => {};
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveRegisterPost = () => resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(shell.getUniversalPushState).mockResolvedValue({ available: true, permission: 'granted', token: 'racey-token' });

    // Mount reconcile, app-resume reconcile and a `push` token-rotation event, all fired before any of
    // them settles — the sequential-only proof in the first report could not tell this apart from three
    // calls that each happen to run one after another.
    const mount = client.reconcileNativePushSubscription('therapygo_android');
    const resume = client.reconcileNativePushSubscription('therapygo_android');
    const tokenEvent = client.reconcileNativePushToken('therapygo_android', 'racey-token');

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(postsOf(fetchMock)).toHaveLength(1); // the other two are queued, not racing in

    resolveRegisterPost();
    await Promise.all([mount, resume, tokenEvent]);

    expect(postsOf(fetchMock)).toHaveLength(1); // still one after the queued calls got their turn
  });
});

describe('nativePushClient — K5 continuation: fallback fingerprint distinguishes equal-length tokens', () => {
  it('POSTs twice for two different equal-length tokens when crypto.subtle.digest is unavailable, never persisting the raw token as the dedupe marker', async () => {
    const { shell, client } = await loadClient();
    const realRandomUUID = crypto.randomUUID.bind(crypto);
    vi.stubGlobal('crypto', {
      randomUUID: realRandomUUID,
      subtle: { digest: vi.fn().mockRejectedValue(new Error('SubtleCrypto unavailable in this WebView')) },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(shell.getUniversalPushState).mockResolvedValue({ available: true, permission: 'granted', token: 'token-aaaaaaaa' });

    await client.reconcileNativePushSubscription('therapygo_android');
    // Same token again — the fallback path must still dedupe an unchanged token.
    await client.reconcileNativePushToken('therapygo_android', 'token-aaaaaaaa');
    // A different, equal-length token must be treated as a genuine rotation, not collide with the first.
    await client.reconcileNativePushToken('therapygo_android', 'token-bbbbbbbb');

    const posts = postsOf(fetchMock);
    expect(posts).toHaveLength(2);
    const rawTokensSent = posts.map(([, init]) => JSON.parse((init as RequestInit).body as string).token as string);
    expect(rawTokensSent).toEqual(['token-aaaaaaaa', 'token-bbbbbbbb']);

    const storedHash = window.localStorage.getItem('bersoncare.nativePushLastSyncedTokenHash.therapygo_android.v1');
    expect(storedHash).not.toBeNull();
    expect(storedHash).not.toContain('token-bbbbbbbb');
    expect(storedHash).not.toContain('token-aaaaaaaa');
  });
});

describe('nativePushClient — K5 continuation: permission request stays out of reconcile', () => {
  it('never requests permission from mount/resume/token-event reconcile — only enableNativePushSubscription does', async () => {
    const { shell, client } = await loadClient();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(shell.getUniversalPushState).mockResolvedValue({ available: true, permission: 'granted', token: 'stable-token' });

    await client.reconcileNativePushSubscription('therapygo_android');
    await client.reconcileNativePushToken('therapygo_android', 'a-different-token');

    expect(shell.requestUniversalPushPermission).not.toHaveBeenCalled();
  });
});

describe('nativePushClient — logout/disable serialize behind an in-flight register (K5 continuation)', () => {
  it('performs the DELETE only after an in-flight register settles, clears the durable dedupe marker, and blocks a later reconcile in the same page', async () => {
    const { shell, client } = await loadClient();
    const calls: string[] = [];
    let resolveRegisterPost: () => void = () => {};
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push(method);
      if (method === 'POST') {
        return new Promise<Response>((resolve) => {
          resolveRegisterPost = () => resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
        });
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(shell.revokeUniversalPush).mockResolvedValue(undefined);
    vi.mocked(shell.getUniversalPushState).mockResolvedValue({ available: true, permission: 'granted', token: 'session-token' });

    const registerDone = client.reconcileNativePushSubscription('therapygo_android');
    await vi.waitFor(() => expect(calls).toContain('POST'));

    const logoutDone = client.revokeNativePushBeforeLogout('therapygo_android');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).not.toContain('DELETE'); // must wait for the in-flight register, not race ahead of it

    resolveRegisterPost();
    await registerDone;
    await logoutDone;

    expect(calls.filter((m) => m === 'DELETE')).toHaveLength(1);
    expect(calls.indexOf('DELETE')).toBeGreaterThan(calls.lastIndexOf('POST'));
    expect(window.localStorage.getItem('bersoncare.nativePushLastSyncedTokenHash.therapygo_android.v1')).toBeNull();

    const fetchCallCountBefore = fetchMock.mock.calls.length;
    await client.reconcileNativePushToken('therapygo_android', 'a-later-token-in-the-same-page');
    expect(fetchMock.mock.calls.length).toBe(fetchCallCountBefore); // blocked: no lifecycle event re-registers after logout in the same page
  });

  it('registers again after a fresh module/session reload even when the device reuses the same push token', async () => {
    // A real page reload wipes the JS module heap (in-memory guards gone) but keeps localStorage — the
    // exact effect that let the concrete regression happen: the same physical device token, reused by the
    // next logged-in user, must not stay silently blocked by a stale dedupe hash from the previous session.
    const sharedWindow = fakeWindow();
    const { shell: shellBeforeLogout, client: clientBeforeLogout } = await loadClient(sharedWindow);
    const fetchMockBeforeLogout = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMockBeforeLogout);
    vi.mocked(shellBeforeLogout.revokeUniversalPush).mockResolvedValue(undefined);
    vi.mocked(shellBeforeLogout.getUniversalPushState).mockResolvedValue({
      available: true,
      permission: 'granted',
      token: 'device-token',
    });

    await clientBeforeLogout.reconcileNativePushSubscription('therapygo_android'); // user A registers
    await clientBeforeLogout.revokeNativePushBeforeLogout('therapygo_android'); // user A logs out

    vi.resetModules(); // simulates the page reload a fresh login performs
    const { shell: shellAfterReload, client: clientAfterReload } = await loadClient(sharedWindow);
    const fetchMockAfterReload = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMockAfterReload);
    vi.mocked(shellAfterReload.getUniversalPushState).mockResolvedValue({
      available: true,
      permission: 'granted',
      token: 'device-token', // same device, new logged-in user
    });

    await clientAfterReload.reconcileNativePushSubscription('therapygo_android');

    expect(postsOf(fetchMockAfterReload)).toHaveLength(1);
  });
});
