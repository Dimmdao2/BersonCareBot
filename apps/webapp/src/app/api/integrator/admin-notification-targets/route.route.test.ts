import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  assertIntegratorGetRequest: vi.fn(),
  loadTargets: vi.fn(),
}));

vi.mock('@/app-layer/integrator/assertIntegratorGetRequest', () => ({
  assertIntegratorGetRequest: fakes.assertIntegratorGetRequest,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    adminNotificationTargets: { loadTargets: fakes.loadTargets },
  }),
}));

import { GET } from './route';

describe('GET /api/integrator/admin-notification-targets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.assertIntegratorGetRequest.mockReturnValue(null);
    fakes.loadTargets.mockResolvedValue({
      telegram: ['global-telegram'],
      max: ['global-max'],
      sms: ['+70000000000'],
      email: ['admin@example.test'],
    });
  });

  it('requires the standard integrator HMAC before loading identities', async () => {
    fakes.assertIntegratorGetRequest.mockReturnValue(
      Response.json({ ok: false, error: 'invalid signature' }, { status: 401 }),
    );

    const response = await GET(
      new Request('https://webapp.test/api/integrator/admin-notification-targets'),
    );

    expect(response.status).toBe(401);
    expect(fakes.loadTargets).not.toHaveBeenCalled();
  });

  it('returns the global platform-admin messenger audience without substituting org admins', async () => {
    const response = await GET(
      new Request(
        'https://webapp.test/api/integrator/admin-notification-targets?organizationId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ),
    );

    expect(fakes.loadTargets).toHaveBeenCalledWith();
    await expect(response.json()).resolves.toEqual({
      ok: true,
      adminMessengerTargets: {
        telegram: ['global-telegram'],
        max: ['global-max'],
      },
    });
  });
});
