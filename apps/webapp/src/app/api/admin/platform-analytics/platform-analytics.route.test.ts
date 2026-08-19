import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  requirePlatformOperationsApiContext: vi.fn(),
  getDashboard: vi.fn(),
  getAppDisplayTimeZone: vi.fn(),
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePlatformOperationsApiContext: fakes.requirePlatformOperationsApiContext,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({ platformAnalytics: { getDashboard: fakes.getDashboard } }),
}));
vi.mock('@/modules/system-settings/appDisplayTimezone', () => ({
  getAppDisplayTimeZone: fakes.getAppDisplayTimeZone,
}));

import { GET } from './route';

describe('GET /api/admin/platform-analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.getAppDisplayTimeZone.mockResolvedValue('Europe/Moscow');
    fakes.getDashboard.mockResolvedValue({ clinics: { now: 1 } });
  });

  it('does not load aggregates when the platform gate refuses', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    fakes.requirePlatformOperationsApiContext.mockResolvedValue({ ok: false, response: denied });

    const response = await GET(new Request('http://localhost/api/admin/platform-analytics'));

    expect(response).toBe(denied);
    expect(fakes.getDashboard).not.toHaveBeenCalled();
  });

  it('returns the dashboard for a platform operator', async () => {
    fakes.requirePlatformOperationsApiContext.mockResolvedValue({
      ok: true,
      session: { user: { userId: '00000000-0000-4000-8000-000000000001' } },
    });

    const response = await GET(
      new Request('http://localhost/api/admin/platform-analytics?preset=week'),
    );

    expect(response.status).toBe(200);
    expect(fakes.getDashboard).toHaveBeenCalledWith({
      iana: 'Europe/Moscow',
      preset: 'week',
      customFrom: undefined,
      customTo: undefined,
    });
  });
});
