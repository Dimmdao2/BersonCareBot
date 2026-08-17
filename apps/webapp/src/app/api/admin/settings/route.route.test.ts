import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  getCurrentSession: vi.fn(),
  requireClinicManagementApiContext: vi.fn(),
  requirePlatformOperationsApiContext: vi.fn(),
  updateSetting: vi.fn(),
  getSetting: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/modules/auth/service', () => ({ getCurrentSession: fakes.getCurrentSession }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireClinicManagementApiContext: fakes.requireClinicManagementApiContext,
  requirePlatformOperationsApiContext: fakes.requirePlatformOperationsApiContext,
}));
vi.mock('@/app-layer/guards/workspaceCapabilities', () => ({
  resolveLaunchCapabilities: () => [],
  hasLaunchCapability: () => false,
}));

import { PATCH } from './route';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const KEY = 'booking_allow_doctor_unlink_past_package_sessions';

describe('/api/admin/settings past-package unlink setting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.getCurrentSession.mockResolvedValue({ user: { userId: 'clinic-owner', role: 'doctor' } });
    fakes.requireClinicManagementApiContext.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: ORGANIZATION_ID,
        membershipRole: 'owner',
        session: { user: { userId: 'clinic-owner', role: 'doctor' } },
      },
    });
    fakes.getSetting.mockResolvedValue(null);
    fakes.updateSetting.mockImplementation(
      async (key: string, scope: string, valueJson: unknown) => ({
        key,
        scope,
        valueJson,
        organizationId: ORGANIZATION_ID,
        updatedAt: '2026-08-17T00:00:00.000Z',
        updatedBy: 'clinic-owner',
      }),
    );
    fakes.buildAppDeps.mockReturnValue({
      systemSettings: {
        getSetting: fakes.getSetting,
        updateSetting: fakes.updateSetting,
      },
    });
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  it.each([true, false])('saves and reads back the boolean value %s', async (value) => {
    const response = await PATCH(
      new Request('http://test/api/admin/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: KEY, value: { value } }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      setting: {
        key: KEY,
        scope: 'admin',
        valueJson: { value },
        organizationId: ORGANIZATION_ID,
      },
    });
    expect(fakes.updateSetting).toHaveBeenCalledWith(
      KEY,
      'admin',
      { value },
      'clinic-owner',
      { organizationId: ORGANIZATION_ID },
    );
  });

  it('refuses a non-boolean instead of weakening validation', async () => {
    const response = await PATCH(
      new Request('http://test/api/admin/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: KEY, value: { value: 'sometimes' } }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'invalid_value' });
    expect(fakes.updateSetting).not.toHaveBeenCalled();
  });
});
