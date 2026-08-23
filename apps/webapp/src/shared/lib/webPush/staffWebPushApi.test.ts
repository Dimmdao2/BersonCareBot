import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchStaffWebPushStatus,
  registerStaffWebPushSubscription,
  unsubscribeAllStaffWebPush,
} from './staffWebPushApi';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('staff web-push account API boundary', () => {
  it('uses account identity-self routes and never the doctor workspace door', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            vapidConfigured: true,
            publicKey: 'public-key',
            hasSubscription: false,
            globalWebPushEnabled: true,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchStaffWebPushStatus();
    await registerStaffWebPushSubscription(
      { endpoint: 'https://push.example.test/sub', keys: { p256dh: 'p256dh', auth: 'auth' } },
      'browser',
    );
    await unsubscribeAllStaffWebPush();

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/account/web-push/status',
      '/api/account/web-push/subscribe',
      '/api/account/web-push/unsubscribe',
    ]);
  });

  it('preserves an explained identity-self refusal for the button flow', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            error: 'identity_self_unavailable',
            message: 'Не удалось подтвердить доступ к вашим личным Push-уведомлениям.',
          }),
          { status: 403 },
        ),
      ),
    );

    await expect(fetchStaffWebPushStatus()).resolves.toEqual({
      ok: false,
      error: 'identity_self_unavailable',
      message: 'Не удалось подтвердить доступ к вашим личным Push-уведомлениям.',
      vapidConfigured: false,
      publicKey: null,
      hasSubscription: false,
      globalWebPushEnabled: false,
    });
  });
});
