import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSession } from '@/shared/types/session';

const fakes = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getCurrentSessionForIdentitySelf: vi.fn(),
  redirect: vi.fn(),
  enterWithDbPlatformPrincipal: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: fakes.redirect,
}));
vi.mock('@/modules/auth/service', () => ({
  getCurrentSession: fakes.getCurrentSession,
  getCurrentSessionForIdentitySelf: fakes.getCurrentSessionForIdentitySelf,
}));
vi.mock('@bersoncare/db-principal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@bersoncare/db-principal')>();
  return {
    ...actual,
    ensureDbPrincipalContext: vi.fn(),
    enterWithDbPlatformPrincipal: fakes.enterWithDbPlatformPrincipal,
    enterWithDbPatientPrincipal: vi.fn(),
    enterWithDbStaffPrincipal: vi.fn(),
    getCurrentDbPrincipal: vi.fn(),
  };
});

import { requirePlatformOperationsApiContext, requirePlatformOperationsPage } from './requireRole';

const adminSession: AppSession = {
  user: {
    userId: '00000000-0000-4000-8000-000000000107',
    role: 'admin',
    displayName: 'Platform operator',
    bindings: {},
    sessionEpoch: 1,
  },
  issuedAt: 1_790_000_000,
  expiresAt: 1_790_043_200,
};

beforeEach(() => {
  vi.clearAllMocks();
  fakes.redirect.mockImplementation((path: string) => {
    throw new Error(`unexpected redirect: ${path}`);
  });
  fakes.getCurrentSession.mockResolvedValue(adminSession);
});

describe('platform operations 2FA boundary', () => {
  it('keeps both the page and API reachable when the admin has not enrolled a factor', async () => {
    await expect(requirePlatformOperationsPage()).resolves.toBe(adminSession);
    await expect(requirePlatformOperationsApiContext()).resolves.toEqual({
      ok: true,
      session: adminSession,
    });

    expect(fakes.redirect).not.toHaveBeenCalled();
    expect(fakes.enterWithDbPlatformPrincipal).toHaveBeenCalledTimes(2);
  });

  it('rejects an enrolled-factor session that has not verified the factor', async () => {
    fakes.getCurrentSession.mockResolvedValue({
      ...adminSession,
      user: { ...adminSession.user, securityFactorRequired: true },
      staffSecurity: { assurance: 'pending_enrollment' },
    } satisfies AppSession);

    const result = await requirePlatformOperationsApiContext();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a forbidden response');
    expect(result.response.status).toBe(403);
    expect(fakes.enterWithDbPlatformPrincipal).not.toHaveBeenCalled();
  });
});
