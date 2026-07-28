import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PLATFORM_COOKIE_NAME } from '@/shared/lib/platform';

const exchangeIntegratorTokenMock = vi.fn();
const classifyVerifiedTokenMock = vi.hoisted(() => vi.fn());

vi.mock('@/modules/auth/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/auth/service')>();
  return {
    ...actual,
    classifyVerifiedIntegratorTokenChannel: (...args: unknown[]) =>
      classifyVerifiedTokenMock(...args),
  };
});

vi.mock('@/modules/auth/authChannelPolicy', () => ({
  isAuthChannelEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    auth: {
      exchangeIntegratorToken: exchangeIntegratorTokenMock,
    },
  }),
}));

import { POST } from './route';

describe('POST /api/auth/exchange', () => {
  beforeEach(() => {
    exchangeIntegratorTokenMock.mockReset();
    classifyVerifiedTokenMock.mockReset();
    classifyVerifiedTokenMock.mockResolvedValue(null);
  });

  it('returns 400 for invalid payload', async () => {
    const res = await POST(
      new Request('http://localhost/api/auth/exchange', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 403 when token is denied', async () => {
    exchangeIntegratorTokenMock.mockResolvedValueOnce(null);
    const res = await POST(
      new Request('http://localhost/api/auth/exchange', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'bad-token' }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it('rejects a verified disabled messenger token before exchange', async () => {
    classifyVerifiedTokenMock.mockResolvedValue('max');
    const res = await POST(
      new Request('http://localhost/api/auth/exchange', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'signed-max-token' }),
      }),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'auth_channel_disabled' });
    expect(exchangeIntegratorTokenMock).not.toHaveBeenCalled();
  });

  it('returns 200 with role and redirect', async () => {
    exchangeIntegratorTokenMock.mockResolvedValueOnce({
      session: {
        user: {
          userId: 'u1',
          role: 'doctor',
          displayName: 'Doctor',
          bindings: {},
        },
        issuedAt: 1,
        expiresAt: 2,
      },
      redirectTo: '/app/doctor',
      setMessengerPlatformCookie: false,
    });
    const res = await POST(
      new Request('http://localhost/api/auth/exchange', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'ok-token' }),
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; role: string; redirectTo: string };
    expect(data).toEqual({
      ok: true,
      role: 'doctor',
      redirectTo: '/app/doctor',
    });
  });

  it('sets bot platform cookie for messenger exchange', async () => {
    exchangeIntegratorTokenMock.mockResolvedValueOnce({
      session: {
        user: {
          userId: 'u2',
          role: 'client',
          displayName: 'Client',
          bindings: { telegramId: '12345' },
        },
        issuedAt: 1,
        expiresAt: 2,
      },
      redirectTo: '/app/patient',
      setMessengerPlatformCookie: true,
    });
    const res = await POST(
      new Request('http://localhost/api/auth/exchange', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'ok-token' }),
      }),
    );
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${PLATFORM_COOKIE_NAME}=bot`);
  });

  it('does not set bot platform cookie when setMessengerPlatformCookie is false (e.g. dev bypass)', async () => {
    classifyVerifiedTokenMock.mockResolvedValue('dev_bypass');
    exchangeIntegratorTokenMock.mockResolvedValueOnce({
      session: {
        user: {
          userId: 'u3',
          role: 'admin',
          displayName: 'Demo',
          bindings: { telegramId: '333333333' },
        },
        issuedAt: 1,
        expiresAt: 2,
      },
      redirectTo: '/app/doctor',
      setMessengerPlatformCookie: false,
    });
    const res = await POST(
      new Request('http://localhost/api/auth/exchange', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'dev:admin' }),
      }),
    );
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).not.toContain(`${PLATFORM_COOKIE_NAME}=bot`);
  });
});
