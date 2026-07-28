import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const exchangeMock = vi.fn();
const isAuthChannelEnabledMock = vi.hoisted(() => vi.fn());

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    auth: {
      exchangeTelegramLoginWidget: exchangeMock,
    },
  }),
}));

vi.mock('@/modules/system-settings/integrationRuntime', () => ({
  getTelegramBotToken: vi.fn(() => Promise.resolve('test-bot-token-for-route')),
}));

vi.mock('@/modules/auth/authChannelPolicy', () => ({
  isAuthChannelEnabled: (...args: unknown[]) => isAuthChannelEnabledMock(...args),
}));

import { POST } from './route';

function widgetHash(botToken: string, fields: Record<string, string>): string {
  const pairs = Object.entries(fields)
    .filter(([k]) => k !== 'hash')
    .sort((a, b) => a[0].localeCompare(b[0]));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join('\n');
  const secretKey = createHash('sha256').update(botToken).digest();
  return createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
}

describe('POST /api/auth/telegram-login', () => {
  beforeEach(() => {
    exchangeMock.mockReset();
    isAuthChannelEnabledMock.mockReset();
    isAuthChannelEnabledMock.mockResolvedValue(true);
  });

  it('rejects a disabled telegram channel before the widget signature is checked', async () => {
    isAuthChannelEnabledMock.mockResolvedValue(false);
    const res = await POST(
      new Request('http://localhost/api/auth/telegram-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          auth_date: String(Math.floor(Date.now() / 1000)),
          id: '999',
          hash: 'ab'.repeat(32),
        }),
      }),
    );
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'auth_channel_disabled' });
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(isAuthChannelEnabledMock).toHaveBeenCalledWith('telegram');
  });

  it('returns 200 when exchange succeeds', async () => {
    exchangeMock.mockResolvedValueOnce({
      session: { user: { role: 'client' } },
      redirectTo: '/app/patient',
    });
    const auth_date = String(Math.floor(Date.now() / 1000));
    const id = '999';
    const token = 'test-bot-token-for-route';
    const hash = widgetHash(token, { auth_date, id });
    const res = await POST(
      new Request('http://localhost/api/auth/telegram-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ auth_date, id, hash }),
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; redirectTo?: string };
    expect(data.ok).toBe(true);
    expect(data.redirectTo).toBe('/app/patient');
  });

  it('returns 403 when signature invalid', async () => {
    exchangeMock.mockResolvedValueOnce(null);
    const res = await POST(
      new Request('http://localhost/api/auth/telegram-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          auth_date: String(Math.floor(Date.now() / 1000)),
          id: '1',
          hash: 'ab'.repeat(32),
        }),
      }),
    );
    expect(res.status).toBe(403);
  });
});
