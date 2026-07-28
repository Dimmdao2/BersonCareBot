import { beforeEach, describe, expect, it, vi } from 'vitest';

const guardMock = vi.hoisted(() => vi.fn());
const buildAppDepsMock = vi.hoisted(() => vi.fn());
const listPlatformOrganizationMembersMock = vi.hoisted(() => vi.fn());

vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePlatformOperationsApiContext: guardMock,
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: buildAppDepsMock,
}));

import { GET } from './route';

const PLATFORM_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

function request(organizationId = ORGANIZATION_ID) {
  return GET(new Request(`http://localhost/api/admin/organizations/${organizationId}/members`), {
    params: Promise.resolve({ organizationId }),
  });
}

beforeEach(() => {
  guardMock.mockReset();
  buildAppDepsMock.mockReset();
  listPlatformOrganizationMembersMock.mockReset();
  buildAppDepsMock.mockReturnValue({
    organizationMembership: {
      listPlatformOrganizationMembers: listPlatformOrganizationMembersMock,
    },
  });
});

describe('GET /api/admin/organizations/:organizationId/members', () => {
  it('returns only staff-directory fields to a platform administrator', async () => {
    guardMock.mockResolvedValueOnce({
      ok: true,
      session: { user: { userId: PLATFORM_USER_ID } },
    });
    listPlatformOrganizationMembersMock.mockResolvedValueOnce([
      {
        id: 'membership-1',
        organizationId: ORGANIZATION_ID,
        platformUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        displayName: 'Анна Врач',
        role: 'doctor',
        status: 'active',
        specialistId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        createdAt: '2026-07-20T10:00:00.000Z',
        updatedAt: '2026-07-21T10:00:00.000Z',
      },
    ]);

    const response = await request();

    expect(response.status).toBe(200);
    expect(listPlatformOrganizationMembersMock).toHaveBeenCalledWith(ORGANIZATION_ID);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      members: [
        {
          id: 'membership-1',
          displayName: 'Анна Врач',
          role: 'doctor',
          status: 'active',
          createdAt: '2026-07-20T10:00:00.000Z',
          specialistLinked: true,
        },
      ],
    });
    expect(guardMock.mock.invocationCallOrder[0]).toBeLessThan(
      buildAppDepsMock.mock.invocationCallOrder[0]!,
    );
  });

  it('denies a clinic-scoped user before repositories are resolved', async () => {
    guardMock.mockResolvedValueOnce({
      ok: false,
      response: Response.json({ ok: false, error: 'forbidden' }, { status: 403 }),
    });

    const response = await request();

    expect(response.status).toBe(403);
    expect(buildAppDepsMock).not.toHaveBeenCalled();
    expect(listPlatformOrganizationMembersMock).not.toHaveBeenCalled();
  });

  it('validates the organization id after the platform guard', async () => {
    guardMock.mockResolvedValueOnce({
      ok: true,
      session: { user: { userId: PLATFORM_USER_ID } },
    });

    const response = await request('not-a-uuid');

    expect(response.status).toBe(400);
    expect(buildAppDepsMock).not.toHaveBeenCalled();
  });
});
