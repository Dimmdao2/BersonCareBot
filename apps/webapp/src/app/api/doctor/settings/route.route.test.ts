import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireDoctorWorkspaceApiContext: vi.fn(),
  persistSettingsBatch: vi.fn(),
  updateSetting: vi.fn(),
  listSettingsByScope: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: fakes.requireDoctorWorkspaceApiContext,
}));

import { GET, PATCH } from './route';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const SMS_KEY = 'sms_fallback_enabled';
const COMMENTS_KEY = 'doctor_patient_support_comments_without_support_default_enabled';
const MEDIA_KEY = 'doctor_patient_support_media_without_support_default_enabled';
const SECURITY_KEY = 'doctor_staff_second_factor_required';

describe('/api/doctor/settings clinic-safe settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireDoctorWorkspaceApiContext.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: ORGANIZATION_ID,
        membershipRole: 'owner',
        session: { user: { userId: 'clinic-owner' } },
      },
    });
    fakes.buildAppDeps.mockReturnValue({
      systemSettings: {
        persistSettingsBatch: fakes.persistSettingsBatch,
        updateSetting: fakes.updateSetting,
        listSettingsByScope: fakes.listSettingsByScope,
      },
    });
  });

  it('commits all cabinet booleans in one organization batch and returns the saved values', async () => {
    const saved = [
      { key: SMS_KEY, valueJson: { value: true }, organizationId: ORGANIZATION_ID },
      { key: COMMENTS_KEY, valueJson: { value: false }, organizationId: ORGANIZATION_ID },
      { key: MEDIA_KEY, valueJson: { value: true }, organizationId: ORGANIZATION_ID },
    ];
    fakes.persistSettingsBatch.mockResolvedValue(saved);

    const response = await PATCH(
      new Request('http://test/api/doctor/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: [
            { key: SMS_KEY, value: { value: true } },
            { key: COMMENTS_KEY, value: { value: false } },
            { key: MEDIA_KEY, value: { value: true } },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, settings: saved });
    expect(fakes.persistSettingsBatch).toHaveBeenCalledTimes(1);
    expect(fakes.persistSettingsBatch).toHaveBeenCalledWith(
      [
        { key: SMS_KEY, scope: 'doctor', value: { value: true } },
        { key: COMMENTS_KEY, scope: 'doctor', value: { value: false } },
        { key: MEDIA_KEY, scope: 'doctor', value: { value: true } },
      ],
      'clinic-owner',
      { organizationId: ORGANIZATION_ID },
    );
  });

  it('saves the clinic SMS fallback setting under the resolved organization', async () => {
    const saved = {
      key: SMS_KEY,
      valueJson: { value: true },
      organizationId: ORGANIZATION_ID,
    };
    fakes.updateSetting.mockResolvedValue(saved);

    const response = await PATCH(
      new Request('http://test/api/doctor/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: SMS_KEY, value: { value: true } }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, setting: saved });
    expect(fakes.updateSetting).toHaveBeenCalledWith(
      SMS_KEY,
      'doctor',
      { value: true },
      'clinic-owner',
      { organizationId: ORGANIZATION_ID },
    );
  });

  it('does not expose a stale global row in the clinic readback', async () => {
    fakes.listSettingsByScope.mockResolvedValue([
      { key: COMMENTS_KEY, valueJson: { value: true }, organizationId: ORGANIZATION_ID },
      { key: SMS_KEY, valueJson: { value: true }, organizationId: null },
    ]);

    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      ok: true,
      settings: [
        { key: COMMENTS_KEY, valueJson: { value: true }, organizationId: ORGANIZATION_ID },
      ],
    });
  });

  it('lets only the clinic owner save staff 2FA under the resolved organization', async () => {
    const saved = {
      key: SECURITY_KEY,
      valueJson: { value: true },
      organizationId: ORGANIZATION_ID,
    };
    fakes.updateSetting.mockResolvedValue(saved);

    const response = await PATCH(
      new Request('http://test/api/doctor/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          key: SECURITY_KEY,
          value: { value: true },
          organizationId: 'attacker-selected-organization',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(fakes.updateSetting).toHaveBeenCalledWith(
      SECURITY_KEY,
      'doctor',
      { value: true },
      'clinic-owner',
      { organizationId: ORGANIZATION_ID },
    );
  });

  it('rejects a non-owner before changing the clinic staff 2FA policy', async () => {
    fakes.requireDoctorWorkspaceApiContext.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: ORGANIZATION_ID,
        membershipRole: 'admin',
        session: { user: { userId: 'clinic-admin' } },
      },
    });

    const response = await PATCH(
      new Request('http://test/api/doctor/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: SECURITY_KEY, value: { value: true } }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'owner_required' });
    expect(fakes.updateSetting).not.toHaveBeenCalled();
  });
});
