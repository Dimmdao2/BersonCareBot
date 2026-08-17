import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  requirePlatform: vi.fn(),
  requireClinic: vi.fn(),
  listSettingsByScope: vi.fn(),
  getSetting: vi.fn(),
  updateSetting: vi.fn(),
  persistAdminModesBatch: vi.fn(),
}));

vi.mock('@/modules/auth/service', () => ({ getCurrentSession: fakes.getCurrentSession }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePlatformOperationsApiContext: fakes.requirePlatform,
  requireClinicManagementApiContext: fakes.requireClinic,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    systemSettings: {
      listSettingsByScope: fakes.listSettingsByScope,
      getSetting: fakes.getSetting,
      updateSetting: fakes.updateSetting,
      persistAdminModesBatch: fakes.persistAdminModesBatch,
    },
  }),
}));

import { GET, PATCH } from './route';

const platformSession = {
  user: {
    userId: '00000000-0000-4000-8000-000000000017',
    role: 'admin',
    displayName: 'Platform admin',
    bindings: {},
  },
  issuedAt: 1,
  expiresAt: 2,
};

const CLINIC_ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const CLINIC_BOOLEAN_KEY = 'booking_allow_doctor_unlink_past_package_sessions';

function patchSettings(body: unknown) {
  return PATCH(
    new Request('https://app.example.test/api/admin/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.getCurrentSession.mockResolvedValue(platformSession);
  fakes.requirePlatform.mockResolvedValue({ ok: true, session: platformSession });
  fakes.getSetting.mockResolvedValue(null);
  fakes.listSettingsByScope.mockResolvedValue([]);
});

describe('global-admin settings HTTP boundary', () => {
  it('saves and reads back the platform notifications fallback without losing Unicode', async () => {
    const saved = {
      key: 'notifications_topics',
      scope: 'admin',
      organizationId: null,
      valueJson: { value: [{ id: 'test', title: 'Тест тема' }] },
      updatedAt: '2026-08-17T00:00:00.000Z',
      updatedBy: platformSession.user.userId,
    };
    fakes.updateSetting.mockResolvedValue(saved);

    const response = await patchSettings({
      key: 'notifications_topics',
      value: [{ id: 'test', title: 'Тест тема' }],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, setting: saved });
    expect(fakes.updateSetting).toHaveBeenCalledWith(
      'notifications_topics',
      'admin',
      { value: [{ id: 'test', title: 'Тест тема' }] },
      platformSession.user.userId,
      { organizationId: null, allowPlatformGlobalFallbackWrite: true },
    );

    fakes.listSettingsByScope.mockResolvedValueOnce([saved]).mockResolvedValueOnce([]);
    await expect((await GET()).json()).resolves.toMatchObject({
      ok: true,
      settings: [saved],
    });
  });

  it('keeps notification topic uniqueness validation before any write', async () => {
    const response = await patchSettings({
      key: 'notifications_topics',
      value: [
        { id: 'test', title: 'Тест тема' },
        { id: 'test', title: 'Дубликат' },
      ],
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'invalid_value' });
    expect(fakes.updateSetting).not.toHaveBeenCalled();
  });

  it('passes the bounded fallback option to the one atomic modes batch', async () => {
    fakes.persistAdminModesBatch.mockResolvedValue([
      {
        key: 'patient_booking_url',
        scope: 'admin',
        organizationId: null,
        valueJson: { value: 'https://booking.example.test' },
        updatedAt: '2026-08-17T00:00:00.000Z',
        updatedBy: platformSession.user.userId,
      },
    ]);

    const response = await patchSettings({
      items: [
        { key: 'patient_booking_url', value: 'https://booking.example.test' },
        { key: 'material_ratings_enabled', value: false },
      ],
    });

    expect(response.status).toBe(200);
    expect(fakes.persistAdminModesBatch).toHaveBeenCalledOnce();
    expect(fakes.persistAdminModesBatch).toHaveBeenCalledWith(
      [
        { key: 'patient_booking_url', valueJson: { value: 'https://booking.example.test' } },
        { key: 'material_ratings_enabled', valueJson: { value: false } },
      ],
      platformSession.user.userId,
      { organizationId: null, allowPlatformGlobalFallbackWrite: true },
    );
  });

  it('rejects duplicate batch keys before the transaction port is reached', async () => {
    const response = await patchSettings({
      items: [
        { key: 'patient_booking_url', value: 'https://booking.example.test' },
        { key: 'patient_booking_url', value: 'https://other.example.test' },
      ],
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'duplicate_key_in_batch',
      key: 'patient_booking_url',
    });
    expect(fakes.persistAdminModesBatch).not.toHaveBeenCalled();
  });

  it('keeps the material-ratings global switch platform-only', async () => {
    const doctorSession = {
      ...platformSession,
      user: { ...platformSession.user, role: 'doctor' },
    };
    fakes.getCurrentSession.mockResolvedValue(doctorSession);
    fakes.requireClinic.mockResolvedValue({
      ok: true,
      ctx: {
        session: doctorSession,
        organizationId: '00000000-0000-4000-8000-000000000118',
        membershipRole: 'owner',
      },
    });

    const response = await patchSettings({ key: 'material_ratings_enabled', value: false });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'forbidden_global_setting',
      key: 'material_ratings_enabled',
    });
    expect(fakes.updateSetting).not.toHaveBeenCalled();
  });

  it('persists and reads back the enabled global material-ratings switch for platform operations', async () => {
    const saved = {
      key: 'material_ratings_enabled',
      scope: 'admin',
      organizationId: null,
      valueJson: { value: true },
      updatedAt: '2026-08-17T00:00:00.000Z',
      updatedBy: platformSession.user.userId,
    };
    fakes.updateSetting.mockResolvedValue(saved);

    const response = await patch({ key: 'material_ratings_enabled', value: true });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, setting: saved });
    expect(fakes.updateSetting).toHaveBeenCalledWith(
      'material_ratings_enabled',
      'admin',
      { value: true },
      platformSession.user.userId,
      { organizationId: null, allowPlatformGlobalFallbackWrite: true },
    );

    fakes.listSettingsByScope.mockResolvedValueOnce([saved]).mockResolvedValueOnce([]);
    await expect((await GET()).json()).resolves.toMatchObject({ ok: true, settings: [saved] });
  });

  it('keeps clinic-owned patient booking writes scoped to the resolved organization', async () => {
    const doctorSession = {
      ...platformSession,
      user: { ...platformSession.user, role: 'doctor' },
    };
    const organizationId = '00000000-0000-4000-8000-000000000118';
    fakes.getCurrentSession.mockResolvedValue(doctorSession);
    fakes.requireClinic.mockResolvedValue({
      ok: true,
      ctx: { session: doctorSession, organizationId, membershipRole: 'owner' },
    });
    fakes.updateSetting.mockResolvedValue({
      key: 'patient_booking_url',
      scope: 'admin',
      organizationId,
      valueJson: { value: 'https://clinic-booking.example.test' },
      updatedAt: '2026-08-17T00:00:00.000Z',
      updatedBy: doctorSession.user.userId,
    });

    const response = await patchSettings({
      key: 'patient_booking_url',
      value: 'https://clinic-booking.example.test',
    });

    expect(response.status).toBe(200);
    expect(fakes.updateSetting).toHaveBeenCalledWith(
      'patient_booking_url',
      'admin',
      { value: 'https://clinic-booking.example.test' },
      doctorSession.user.userId,
      { organizationId },
    );
  });
});

describe('clinic-owner atomic settings readback', () => {
  const clinicSession = {
    ...platformSession,
    user: { ...platformSession.user, userId: 'clinic-owner', role: 'doctor' },
  };

  beforeEach(() => {
    fakes.getCurrentSession.mockResolvedValue(clinicSession);
    fakes.requireClinic.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: CLINIC_ORGANIZATION_ID,
        membershipRole: 'owner',
        session: clinicSession,
      },
    });
    fakes.updateSetting.mockImplementation(
      async (key: string, scope: string, valueJson: unknown) => ({
        key,
        scope,
        valueJson,
        organizationId: CLINIC_ORGANIZATION_ID,
        updatedAt: '2026-08-17T00:00:00.000Z',
        updatedBy: clinicSession.user.userId,
      }),
    );
  });

  it.each([true, false])('saves and reads back the boolean value %s', async (value) => {
    const response = await patchSettings({ key: CLINIC_BOOLEAN_KEY, value: { value } });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      setting: {
        key: CLINIC_BOOLEAN_KEY,
        scope: 'admin',
        valueJson: { value },
        organizationId: CLINIC_ORGANIZATION_ID,
      },
    });
    expect(fakes.updateSetting).toHaveBeenCalledWith(
      CLINIC_BOOLEAN_KEY,
      'admin',
      { value },
      clinicSession.user.userId,
      { organizationId: CLINIC_ORGANIZATION_ID },
    );
  });

  it('refuses a non-boolean instead of weakening validation', async () => {
    const response = await patchSettings({
      key: CLINIC_BOOLEAN_KEY,
      value: { value: 'sometimes' },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'invalid_value' });
    expect(fakes.updateSetting).not.toHaveBeenCalled();
  });
});
