import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORGANIZATION_ID = '550e8400-e29b-41d4-a716-446655440010';

const requireEntitlementMock = vi.hoisted(() => vi.fn());
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForMutation: requireEntitlementMock,
}));

const {
  getSessionMock,
  listSettingsByScopeMock,
  updateSettingMock,
  getSettingMock,
  listTopicsMock,
  persistAdminModesBatchMock,
  clearSettingMock,
  resolveOrganizationForUserMock,
  buildAppDepsMock,
} = vi.hoisted(() => {
  const listSettingsByScope = vi.fn();
  const updateSetting = vi.fn();
  const getSetting = vi.fn();
  const listTopics = vi.fn();
  const persistAdminModesBatch = vi.fn();
  const clearSetting = vi.fn();
  const resolveOrganizationForUser = vi.fn();
  return {
    getSessionMock: vi.fn(),
    listSettingsByScopeMock: listSettingsByScope,
    updateSettingMock: updateSetting,
    getSettingMock: getSetting,
    listTopicsMock: listTopics,
    persistAdminModesBatchMock: persistAdminModesBatch,
    clearSettingMock: clearSetting,
    resolveOrganizationForUserMock: resolveOrganizationForUser,
    buildAppDepsMock: vi.fn(() => ({
      systemSettings: {
        listSettingsByScope,
        updateSetting,
        getSetting,
        persistAdminModesBatch,
        clearSetting,
      },
      subscriptionMailingProjection: { listTopics },
      organizationMembership: { resolveOrganizationForUser },
    })),
  };
});

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: buildAppDepsMock }));
vi.mock('@/modules/auth/service', () => ({ getCurrentSession: getSessionMock }));
vi.mock('@/modules/system-settings/syncToIntegrator', () => ({
  normalizeStoredValueJsonForIntegratorSync: (value: unknown) => value,
  syncSettingToIntegrator: vi.fn(),
}));

import { DELETE, GET, PATCH } from './route';
import { ALLOWED_KEYS, type SystemSetting } from '@/modules/system-settings/types';

const clinicOwnerSession = {
  user: { userId: 'owner-1', role: 'doctor' as const, bindings: {} },
};

const platformAdminSession = {
  user: { userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin' as const, bindings: {} },
  adminMode: true,
};

function clinicMembership(role: 'owner' | 'admin' | 'doctor' = 'owner') {
  return {
    ok: true as const,
    context: {
      organizationId: ORGANIZATION_ID,
      membershipId: 'membership-1',
      role,
      specialistId: role === 'doctor' ? 'specialist-1' : null,
      canManageOrganization: role === 'owner' || role === 'admin',
      canManageAllSpecialists: role === 'owner' || role === 'admin',
    },
  };
}

function patchRequest(key: string, value: unknown): Request {
  return new Request('http://localhost/api/admin/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  });
}

function deleteRequest(key: string): Request {
  return new Request('http://localhost/api/admin/settings', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
}

describe('GET /api/admin/settings', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    listSettingsByScopeMock.mockReset().mockResolvedValue([]);
    resolveOrganizationForUserMock.mockReset().mockResolvedValue(clinicMembership());
  });

  it('returns 401 without a session', async () => {
    getSessionMock.mockResolvedValue(null);

    expect((await GET()).status).toBe(401);
  });

  it('returns 403 for a clinical specialist without management capability', async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: 'doctor-1', role: 'doctor', bindings: {} },
    });
    resolveOrganizationForUserMock.mockResolvedValue(clinicMembership('doctor'));

    expect((await GET()).status).toBe(403);
  });

  it('lists global settings for a platform admin without resolving a clinic', async () => {
    getSessionMock.mockResolvedValue(platformAdminSession);
    listSettingsByScopeMock.mockImplementation(async (scope: 'admin' | 'doctor') =>
      scope === 'admin'
        ? [
            {
              key: 'operator_health_probe_config',
              scope: 'admin',
              organizationId: null,
              valueJson: { value: {} },
              updatedAt: '',
              updatedBy: null,
            } as SystemSetting,
          ]
        : [],
    );

    const response = await GET();
    const body = (await response.json()) as { settings: SystemSetting[] };

    expect(response.status).toBe(200);
    expect(body.settings.map((setting) => setting.key)).toEqual(['operator_health_probe_config']);
    expect(resolveOrganizationForUserMock).not.toHaveBeenCalled();
    expect(listSettingsByScopeMock).toHaveBeenCalledWith('admin', { organizationId: null });
    expect(listSettingsByScopeMock).toHaveBeenCalledWith('doctor', { organizationId: null });
  });

  it('returns only a configured marker for the VK ID protected key', async () => {
    getSessionMock.mockResolvedValue(platformAdminSession);
    const configuredMarker = 'vk-id-configured-marker';
    listSettingsByScopeMock.mockImplementation(async (scope: 'admin' | 'doctor') =>
      scope === 'admin'
        ? [
            {
              key: 'vk_id_client_secret',
              scope: 'admin',
              organizationId: null,
              valueJson: { value: configuredMarker },
              updatedAt: '',
              updatedBy: null,
            } as SystemSetting,
          ]
        : [],
    );

    const body = await (await GET()).json();
    expect(body.settings[0]?.valueJson).toEqual({ value: { hasStoredSecret: true } });
    expect(JSON.stringify(body)).not.toContain(configuredMarker);
  });

  it('returns only organization-owned settings for a clinic owner', async () => {
    getSessionMock.mockResolvedValue(clinicOwnerSession);
    listSettingsByScopeMock.mockImplementation(async (scope: 'admin' | 'doctor') =>
      scope === 'admin'
        ? [
            {
              key: 'booking_min_notice_hours',
              scope: 'admin',
              organizationId: ORGANIZATION_ID,
              valueJson: { value: 12 },
              updatedAt: '',
              updatedBy: null,
            } as SystemSetting,
            {
              key: 'dev_mode',
              scope: 'admin',
              organizationId: null,
              valueJson: { value: false },
              updatedAt: '',
              updatedBy: null,
            } as SystemSetting,
          ]
        : [
            {
              key: 'patient_label',
              scope: 'doctor',
              organizationId: ORGANIZATION_ID,
              valueJson: { value: 'клиент' },
              updatedAt: '',
              updatedBy: null,
            } as SystemSetting,
          ],
    );

    const response = await GET();
    const body = (await response.json()) as { settings: SystemSetting[] };

    expect(response.status).toBe(200);
    expect(body.settings.map((setting) => setting.key)).toEqual([
      'booking_min_notice_hours',
      'patient_label',
    ]);
    expect(listSettingsByScopeMock).toHaveBeenCalledWith('admin', {
      organizationId: ORGANIZATION_ID,
    });
    expect(listSettingsByScopeMock).toHaveBeenCalledWith('doctor', {
      organizationId: ORGANIZATION_ID,
    });
  });
});

describe('system settings registry', () => {
  it('retains launch organization settings and dormant U9 global keys', () => {
    expect(ALLOWED_KEYS).toEqual(
      expect.arrayContaining([
        'booking_min_notice_hours',
        'booking_payment_enabled',
        'doctor_appointment_reminder_enabled',
        'doctor_appointment_reminder_offsets_minutes',
        'doctor_today_preferences',
        'patient_home_daily_practice_target',
        'patient_home_mood_icons',
        'patient_label',
        'smtp_outbound',
        'web_push_vapid',
      ]),
    );
  });
});

describe('PATCH /api/admin/settings', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    resolveOrganizationForUserMock.mockReset().mockResolvedValue(clinicMembership());
    listSettingsByScopeMock.mockReset().mockResolvedValue([]);
    updateSettingMock
      .mockReset()
      .mockImplementation(
        async (key: string, scope: 'admin' | 'doctor', valueJson: unknown, updatedBy: string) => ({
          key,
          scope,
          organizationId: ORGANIZATION_ID,
          valueJson,
          updatedAt: '',
          updatedBy,
        }),
      );
    getSettingMock.mockReset().mockResolvedValue(null);
    listTopicsMock.mockReset().mockResolvedValue([]);
    persistAdminModesBatchMock.mockReset().mockResolvedValue([]);
    requireEntitlementMock.mockReset().mockResolvedValue({ ok: true });
  });

  it('returns 401 without a session', async () => {
    getSessionMock.mockResolvedValue(null);

    expect((await PATCH(patchRequest('booking_min_notice_hours', 24))).status).toBe(401);
  });

  it('returns 403 for a specialist without organization management', async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: 'doctor-1', role: 'doctor', bindings: {} },
    });
    resolveOrganizationForUserMock.mockResolvedValue(clinicMembership('doctor'));

    expect((await PATCH(patchRequest('booking_min_notice_hours', 24))).status).toBe(403);
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it('writes platform global configuration without borrowing an organization', async () => {
    getSessionMock.mockResolvedValue(platformAdminSession);
    updateSettingMock.mockResolvedValue({
      key: 'dev_mode',
      scope: 'admin',
      organizationId: null,
      valueJson: { value: true },
      updatedAt: '',
      updatedBy: platformAdminSession.user.userId,
    });

    const response = await PATCH(patchRequest('dev_mode', true));

    expect(response.status).toBe(200);
    expect(resolveOrganizationForUserMock).not.toHaveBeenCalled();
    expect(updateSettingMock).toHaveBeenCalledWith(
      'dev_mode',
      'admin',
      { value: true },
      platformAdminSession.user.userId,
      { organizationId: null },
    );
  });

  it('redacts the VK ID protected key from the audit event and response', async () => {
    getSessionMock.mockResolvedValue(platformAdminSession);
    const configuredMarker = 'vk-id-new-configured-marker';
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    updateSettingMock.mockResolvedValue({
      key: 'vk_id_client_secret',
      scope: 'admin',
      organizationId: null,
      valueJson: { value: configuredMarker },
      updatedAt: '',
      updatedBy: platformAdminSession.user.userId,
    });

    const response = await PATCH(patchRequest('vk_id_client_secret', configuredMarker));
    const responseBody = await response.json();
    const auditCalls = JSON.stringify(infoSpy.mock.calls);
    infoSpy.mockRestore();

    expect(response.status).toBe(200);
    expect(responseBody.setting.valueJson).toEqual({ value: { hasStoredSecret: true } });
    expect(JSON.stringify(responseBody)).not.toContain(configuredMarker);
    expect(auditCalls).not.toContain(configuredMarker);
    expect(auditCalls).toContain('[REDACTED]');
  });

  it('rejects a global setting for a clinic owner', async () => {
    getSessionMock.mockResolvedValue(clinicOwnerSession);

    const response = await PATCH(patchRequest('dev_mode', true));
    const body = (await response.json()) as { error: string; key: string };

    expect(response.status).toBe(403);
    expect(body).toEqual({ ok: false, error: 'forbidden_global_setting', key: 'dev_mode' });
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it('writes an admin-scope organization setting with exact organization context', async () => {
    getSessionMock.mockResolvedValue(clinicOwnerSession);

    const response = await PATCH(patchRequest('booking_min_notice_hours', '24'));

    expect(response.status).toBe(200);
    expect(updateSettingMock).toHaveBeenCalledWith(
      'booking_min_notice_hours',
      'admin',
      { value: 24 },
      'owner-1',
      { organizationId: ORGANIZATION_ID },
    );
  });

  it('writes the doctor-scope patient label through the same organization context', async () => {
    getSessionMock.mockResolvedValue(clinicOwnerSession);

    const response = await PATCH(patchRequest('patient_label', 'КЛИЕНТ'));

    expect(response.status).toBe(200);
    expect(updateSettingMock).toHaveBeenCalledWith(
      'patient_label',
      'doctor',
      { value: 'клиент' },
      'owner-1',
      { organizationId: ORGANIZATION_ID },
    );
  });

  it('validates an organization-owned numeric setting', async () => {
    getSessionMock.mockResolvedValue(clinicOwnerSession);

    const response = await PATCH(patchRequest('patient_home_daily_practice_target', 11));

    expect(response.status).toBe(400);
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it('normalizes organization appointment reminder offsets', async () => {
    getSessionMock.mockResolvedValue(clinicOwnerSession);

    const response = await PATCH(
      patchRequest('doctor_appointment_reminder_offsets_minutes', [1440, 120]),
    );

    expect(response.status).toBe(200);
    expect(updateSettingMock).toHaveBeenCalledWith(
      'doctor_appointment_reminder_offsets_minutes',
      'doctor',
      { value: [1440, 120] },
      'owner-1',
      { organizationId: ORGANIZATION_ID },
    );
  });

  it('writes normalized organization-owned Today preferences in doctor scope', async () => {
    getSessionMock.mockResolvedValue(clinicOwnerSession);

    const response = await PATCH(
      patchRequest('doctor_today_preferences', {
        visibleProactiveInsightKinds: ['program_inactivity', 'wellbeing_low_streak'],
        peopleListMode: 'recent_visits',
      }),
    );

    expect(response.status).toBe(200);
    expect(updateSettingMock).toHaveBeenCalledWith(
      'doctor_today_preferences',
      'doctor',
      {
        value: {
          visibleProactiveInsightKinds: ['wellbeing_low_streak', 'program_inactivity'],
          peopleListMode: 'recent_visits',
        },
      },
      'owner-1',
      { organizationId: ORGANIZATION_ID },
    );
  });

  it('rejects undefined Today ranking or hiding semantics', async () => {
    getSessionMock.mockResolvedValue(clinicOwnerSession);

    const response = await PATCH(
      patchRequest('doctor_today_preferences', {
        visibleProactiveInsightKinds: ['most_active'],
        peopleListMode: 'hidden_clients',
      }),
    );

    expect(response.status).toBe(400);
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it('enforces owner-only patient-home settings for organization admins', async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: 'manager-1', role: 'doctor', bindings: {} },
    });
    resolveOrganizationForUserMock.mockResolvedValue(clinicMembership('admin'));

    const response = await PATCH(patchRequest('patient_home_daily_practice_target', 4));

    expect(response.status).toBe(403);
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it('checks payment entitlement after organization authorization', async () => {
    getSessionMock.mockResolvedValue(clinicOwnerSession);
    requireEntitlementMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'payment_required' }), {
        status: 402,
      }),
    });

    const response = await PATCH(patchRequest('booking_payment_enabled', true));

    expect(response.status).toBe(402);
    expect(requireEntitlementMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
      'payments',
    );
    expect(updateSettingMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/admin/settings', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    resolveOrganizationForUserMock.mockReset().mockResolvedValue(clinicMembership());
    clearSettingMock.mockReset().mockResolvedValue(true);
  });

  it('clears the global override for a platform admin without resolving a clinic', async () => {
    getSessionMock.mockResolvedValue(platformAdminSession);

    const response = await DELETE(deleteRequest('operator_health_probe_config'));

    expect(response.status).toBe(200);
    expect(resolveOrganizationForUserMock).not.toHaveBeenCalled();
    expect(clearSettingMock).toHaveBeenCalledWith(
      'operator_health_probe_config',
      'admin',
      platformAdminSession.user.userId,
      { organizationId: null },
    );
  });

  it('keeps a clinic manager on the organization path and denies the platform-only reset', async () => {
    getSessionMock.mockResolvedValue(clinicOwnerSession);

    const response = await DELETE(deleteRequest('operator_health_probe_config'));

    expect(response.status).toBe(403);
    expect(resolveOrganizationForUserMock).toHaveBeenCalledWith({ platformUserId: 'owner-1' });
    expect(clearSettingMock).not.toHaveBeenCalled();
  });

  it('pins global-only DELETE privileges for the platform settings principal', async () => {
    const { readFileSync } = await import('node:fs');
    const sql = readFileSync('../../deploy/postgres/u9a-platform-settings-role.sql', 'utf8');

    expect(sql).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.system_settings TO app_platform_settings',
    );
    expect(sql).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_runtime_settings TO app_platform_settings',
    );
    expect(sql).toContain(
      'FOR ALL TO app_platform_settings\n  USING (organization_id IS NULL) WITH CHECK (organization_id IS NULL)',
    );
  });
});
