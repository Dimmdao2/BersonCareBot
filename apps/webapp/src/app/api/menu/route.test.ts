import { beforeEach, describe, expect, it, vi } from 'vitest';

const authenticatedGateMock = vi.hoisted(() => vi.fn());
const buildAppDepsMock = vi.hoisted(() => vi.fn());
const resolvePatientContentMock = vi.hoisted(() => vi.fn());

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireAuthenticatedApiSession: authenticatedGateMock,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: buildAppDepsMock,
}));
vi.mock('@/app-layer/platform-access', () => ({
  resolvePatientCanViewAuthOnlyContent: resolvePatientContentMock,
}));
vi.mock('@/app-layer/logging/serverRuntimeLog', () => ({
  logServerRuntimeError: vi.fn(),
}));

import { GET } from './route';

const SESSION = {
  user: { userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'client' as const },
};

describe('GET /api/menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticatedGateMock.mockResolvedValue({ ok: true, session: SESSION });
    resolvePatientContentMock.mockResolvedValue(true);
    buildAppDepsMock.mockReturnValue({
      contentSections: { listVisible: vi.fn().mockResolvedValue([{ slug: 'help' }]) },
      menu: { getMenuForRole: vi.fn(() => [{ href: '/app/patient' }]) },
    });
  });

  it('returns the patient menu after the authenticated principal guard', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      items: [{ href: '/app/patient' }],
    });
  });

  it('rejects a guest before constructing DB dependencies', async () => {
    authenticatedGateMock.mockResolvedValue({
      ok: false,
      response: Response.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    });
    const response = await GET();
    expect(response.status).toBe(401);
    expect(buildAppDepsMock).not.toHaveBeenCalled();
  });
});
