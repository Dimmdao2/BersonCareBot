import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requirePlatformOperationsApiContext: vi.fn(),
  setOrganizationActive: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePlatformOperationsApiContext: fakes.requirePlatformOperationsApiContext,
}));

import { PATCH } from './route';

const ORG_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requirePlatformOperationsApiContext.mockResolvedValue({
    ok: true,
    session: { user: { userId: 'actor-1' } },
  });
  fakes.setOrganizationActive.mockResolvedValue({ isActive: false, changed: true });
  fakes.buildAppDeps.mockReturnValue({
    platformEntitlements: { setOrganizationActive: fakes.setOrganizationActive },
  });
});

describe('PATCH /api/admin/organizations/[organizationId]', () => {
  it('refuses when the platform gate rejects', async () => {
    fakes.requirePlatformOperationsApiContext.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false }, { status: 403 }),
    });

    const response = await PATCH(
      new Request(`http://localhost/api/admin/organizations/${ORG_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false, reason: 'abuse' }),
      }),
      { params: Promise.resolve({ organizationId: ORG_ID }) },
    );

    expect(response.status).toBe(403);
    expect(fakes.setOrganizationActive).not.toHaveBeenCalled();
  });

  it('toggles organization account state for platform admin', async () => {
    const response = await PATCH(
      new Request(`http://localhost/api/admin/organizations/${ORG_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false, reason: 'fraud review' }),
      }),
      { params: Promise.resolve({ organizationId: ORG_ID }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, isActive: false, changed: true });
    expect(fakes.setOrganizationActive).toHaveBeenCalledWith(ORG_ID, false, {
      actorId: 'actor-1',
      reason: 'fraud review',
    });
  });
});
