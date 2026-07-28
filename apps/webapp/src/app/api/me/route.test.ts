import { beforeEach, describe, expect, it, vi } from 'vitest';

const authenticatedGateMock = vi.hoisted(() => vi.fn());
const buildAppDepsMock = vi.hoisted(() => vi.fn());
const renewSessionMock = vi.hoisted(() => vi.fn());
const resolvePlatformAccessMock = vi.hoisted(() => vi.fn());

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireAuthenticatedIdentitySelfApiSession: authenticatedGateMock,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: buildAppDepsMock,
}));
vi.mock('@/modules/auth/service', () => ({
  renewSessionCookieFromRequest: renewSessionMock,
}));
vi.mock('@/app-layer/platform-access', () => ({
  resolvePlatformAccessContext: resolvePlatformAccessMock,
}));
vi.mock('@/config/env', () => ({ env: { DATABASE_URL: 'postgres://test' } }));

import { GET } from './route';

const SESSION = {
  user: { userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'client' as const },
  postLoginHints: undefined,
};

describe('GET /api/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticatedGateMock.mockResolvedValue({ ok: true, session: SESSION });
    buildAppDepsMock.mockReturnValue({
      userPins: { getByUserId: vi.fn().mockResolvedValue(null) },
      users: { getCurrentUser: vi.fn(() => SESSION.user) },
    });
    resolvePlatformAccessMock.mockResolvedValue({
      canonicalUserId: SESSION.user.userId,
      dbRole: 'client',
      tier: 'patient',
      hasPhoneInDb: true,
      phoneTrustedForPatient: true,
      resolution: 'canonical',
    });
  });

  it('returns the authenticated account through the common session guard', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      user: SESSION.user,
      security: { hasPin: false },
    });
    expect(renewSessionMock).toHaveBeenCalledOnce();
  });

  it('rejects an unauthenticated caller before constructing DB dependencies', async () => {
    authenticatedGateMock.mockResolvedValue({
      ok: false,
      response: Response.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    });
    const response = await GET();
    expect(response.status).toBe(401);
    expect(buildAppDepsMock).not.toHaveBeenCalled();
  });
});
