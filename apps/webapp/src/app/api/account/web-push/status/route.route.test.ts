import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireAccountWebPushSelfApiSession: vi.fn(),
  getWebPushVapidPublicKeyOnly: vi.fn(),
  hasAnyForUserId: vi.fn(),
  getPreferences: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireAccountWebPushSelfApiSession: fakes.requireAccountWebPushSelfApiSession,
}));

import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requireAccountWebPushSelfApiSession.mockResolvedValue({
    ok: true,
    session: { user: { userId: 'admin-1' } },
  });
  fakes.getWebPushVapidPublicKeyOnly.mockResolvedValue('public-key');
  fakes.hasAnyForUserId.mockResolvedValue(true);
  fakes.getPreferences.mockResolvedValue([
    { channelCode: 'web_push', isEnabledForNotifications: true },
  ]);
  fakes.buildAppDeps.mockReturnValue({
    systemSettings: { getWebPushVapidPublicKeyOnly: fakes.getWebPushVapidPublicKeyOnly },
    webPushSubscriptions: { hasAnyForUserId: fakes.hasAnyForUserId },
    channelPreferencesPort: { getPreferences: fakes.getPreferences },
  });
});

describe('GET /api/account/web-push/status', () => {
  it('reads only the authenticated person through the identity-self door', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      vapidConfigured: true,
      publicKey: 'public-key',
      hasSubscription: true,
      globalWebPushEnabled: true,
    });
    expect(fakes.hasAnyForUserId).toHaveBeenCalledWith('admin-1');
    expect(fakes.getPreferences).toHaveBeenCalledWith('admin-1');
  });

  it('returns the guard refusal without touching personal-data ports', async () => {
    fakes.requireAccountWebPushSelfApiSession.mockResolvedValue({
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: 'identity_self_unavailable',
          message: 'Не удалось подтвердить доступ к вашим личным Push-уведомлениям.',
        },
        { status: 403 },
      ),
    });

    const response = await GET();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'identity_self_unavailable',
      message: 'Не удалось подтвердить доступ к вашим личным Push-уведомлениям.',
    });
    expect(fakes.buildAppDeps).not.toHaveBeenCalled();
  });
});
