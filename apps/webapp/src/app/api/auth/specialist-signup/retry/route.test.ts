import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentSessionMock = vi.fn();
const getLatestIntentMock = vi.fn();
const provisionOwnerMock = vi.fn();

vi.mock('@/modules/auth/service', () => ({
  getCurrentSession: () => getCurrentSessionMock(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    organizationProvisioning: {
      getLatestSpecialistSignupIntentForUser: getLatestIntentMock,
      provisionSpecialistOwner: provisionOwnerMock,
    },
  }),
}));

import { POST } from './route';
import * as authChannelPolicy from '@/modules/auth/authChannelPolicy';

const userId = '11111111-1111-4111-8111-111111111111';
const request = () =>
  new Request('http://localhost/api/auth/specialist-signup/retry', { method: 'POST' });

describe('POST /api/auth/specialist-signup/retry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a disabled email channel before reading the protected session or signup intent', async () => {
    const policy = vi.spyOn(authChannelPolicy, 'isAuthChannelEnabled').mockResolvedValue(false);
    try {
      const response = await POST(request());

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ ok: false, error: 'auth_channel_disabled' });
      expect(getCurrentSessionMock).not.toHaveBeenCalled();
      expect(getLatestIntentMock).not.toHaveBeenCalled();
      expect(provisionOwnerMock).not.toHaveBeenCalled();
    } finally {
      policy.mockRestore();
    }
  });

  it('rejects a doctor session that has no protected signup assurance', async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { userId, role: 'doctor' } });

    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(getLatestIntentMock).not.toHaveBeenCalled();
    expect(provisionOwnerMock).not.toHaveBeenCalled();
  });

  it("retries the authenticated user's reserved intent without asking for another slug", async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: { userId, role: 'doctor' },
      staffSecurity: { assurance: 'factor_verified' },
    });
    getLatestIntentMock.mockResolvedValue({
      userId,
      challengeId: '22222222-2222-4222-8222-222222222222',
      organizationSlug: 'clinic-one',
    });
    provisionOwnerMock.mockResolvedValue({
      organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      membershipId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });

    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(getLatestIntentMock).toHaveBeenCalledWith();
    expect(provisionOwnerMock).toHaveBeenCalledWith({
      challengeId: '22222222-2222-4222-8222-222222222222',
    });
    await expect(response.json()).resolves.toEqual({
      ok: true,
      redirectTo: '/app/account?tab=security',
      organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      membershipId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });
  });

  it.each(['pending_enrollment', 'recovery', 'recovery_confirmation'] as const)(
    'rejects %s before reading or provisioning the signup intent',
    async (assurance) => {
      getCurrentSessionMock.mockResolvedValue({
        user: { userId, role: 'doctor' },
        staffSecurity: { assurance },
      });

      const response = await POST(request());

      expect(response.status).toBe(403);
      expect(getLatestIntentMock).not.toHaveBeenCalled();
      expect(provisionOwnerMock).not.toHaveBeenCalled();
    },
  );
});
