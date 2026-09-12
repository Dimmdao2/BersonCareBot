import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redactSettingValueForAudit } from '@/modules/system-settings/auditRedaction';
import type { SetCustomDomainIntentInput } from '@/modules/custom-domain-binding/ports';

const fakes = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  requirePlatform: vi.fn(),
  requireClinic: vi.fn(),
  listSettingsByScope: vi.fn(),
  getSetting: vi.fn(),
  updateSetting: vi.fn(),
  persistSettingsBatch: vi.fn(),
  persistAdminModesBatch: vi.fn(),
  getClinicPlatformIntegrationAvailability: vi.fn(),
  requireEntitlementForMutation: vi.fn(),
  setCustomDomainIntent: vi.fn(),
  clearCustomDomainIntent: vi.fn(),
}));

vi.mock('@/modules/auth/service', () => ({ getCurrentSession: fakes.getCurrentSession }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePlatformOperationsApiContext: fakes.requirePlatform,
  requireClinicManagementApiContext: fakes.requireClinic,
}));
vi.mock('@/app-layer/guards/requireEntitlement', async () => {
  const actual = await vi.importActual<typeof import('@/app-layer/guards/requireEntitlement')>(
    '@/app-layer/guards/requireEntitlement',
  );
  return {
    ...actual,
    requireEntitlementForMutation: fakes.requireEntitlementForMutation,
  };
});
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    systemSettings: {
      listSettingsByScope: fakes.listSettingsByScope,
      getSetting: fakes.getSetting,
      updateSetting: fakes.updateSetting,
      persistSettingsBatch: fakes.persistSettingsBatch,
      persistAdminModesBatch: fakes.persistAdminModesBatch,
      getClinicPlatformIntegrationAvailability: fakes.getClinicPlatformIntegrationAvailability,
    },
    customDomainBinding: {
      setCustomDomainIntent: fakes.setCustomDomainIntent,
      clearCustomDomainIntent: fakes.clearCustomDomainIntent,
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
const CLINIC_ROOT_SKIP_PUBLIC_CARD_KEY = 'clinic_root_skip_public_card';

function patch(body: unknown) {
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
  fakes.requireEntitlementForMutation.mockResolvedValue({ ok: true });
  fakes.setCustomDomainIntent.mockResolvedValue({
    ok: true,
    state: {
      organizationId: CLINIC_ORGANIZATION_ID,
      baseDomain: 'clinic.example.test',
      placement: 'apex',
      subdomainLabel: null,
      hostname: 'clinic.example.test',
      status: 'pending',
      statusReason: null,
      activatedAt: null,
    },
  });
  fakes.clearCustomDomainIntent.mockResolvedValue({ ok: true, state: null });
  fakes.getClinicPlatformIntegrationAvailability.mockResolvedValue({
    version: 1,
    integrations: { email: true, smsc: true, telegram: true, max: true, vk: true },
  });
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

    const response = await patch({
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
    const response = await patch({
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

    const response = await patch({
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
    const response = await patch({
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

    const response = await patch({ key: 'material_ratings_enabled', value: false });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'forbidden_global_setting',
      key: 'material_ratings_enabled',
    });
    expect(fakes.updateSetting).not.toHaveBeenCalled();
  });

  it('does not let a clinic mutate the global TherapyGo Telegram credential', async () => {
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

    const response = await patch({ key: 'therapygo_telegram_bot_token', value: 'clinic-secret' });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'forbidden_global_setting',
      key: 'therapygo_telegram_bot_token',
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

    const response = await patch({
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

  it('writes the branded-root flag only for the organization from the trusted gate', async () => {
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
      key: CLINIC_ROOT_SKIP_PUBLIC_CARD_KEY,
      scope: 'admin',
      organizationId,
      valueJson: { value: true },
      updatedAt: '2026-08-23T00:00:00.000Z',
      updatedBy: doctorSession.user.userId,
    });

    const response = await patch({ key: CLINIC_ROOT_SKIP_PUBLIC_CARD_KEY, value: true });

    expect(response.status).toBe(200);
    expect(fakes.updateSetting).toHaveBeenCalledWith(
      CLINIC_ROOT_SKIP_PUBLIC_CARD_KEY,
      'admin',
      { value: true },
      doctorSession.user.userId,
      { organizationId },
    );
  });

  it('#1071: never lets a booking payment-provider secret reach the audit log line', async () => {
    const doctorSession = {
      ...platformSession,
      user: { ...platformSession.user, role: 'doctor' },
    };
    const organizationId = '00000000-0000-4000-8000-000000000119';
    fakes.getCurrentSession.mockResolvedValue(doctorSession);
    fakes.requireClinic.mockResolvedValue({
      ok: true,
      ctx: { session: doctorSession, organizationId, membershipRole: 'owner' },
    });
    const oldSecretApiKey = 'ak_old-do-not-leak-this-2d11';
    const secretApiKey = 'ak_live_do-not-leak-this-9f31';
    const bodyValue = {
      enabled: true,
      defaultProviderId: 'yookassa',
      providers: [{ id: 'yookassa', label: 'ЮKassa', enabled: true, apiKey: secretApiKey }],
    };
    fakes.getSetting.mockResolvedValue({
      key: 'booking_payment_providers',
      scope: 'admin',
      organizationId,
      valueJson: {
        value: {
          ...bodyValue,
          providers: [{ ...bodyValue.providers[0], apiKey: oldSecretApiKey }],
        },
      },
      updatedAt: '2026-09-01T00:00:00.000Z',
      updatedBy: doctorSession.user.userId,
    });
    fakes.updateSetting.mockResolvedValue({
      key: 'booking_payment_providers',
      scope: 'admin',
      organizationId,
      valueJson: { value: bodyValue },
      updatedAt: '2026-09-02T00:00:00.000Z',
      updatedBy: doctorSession.user.userId,
    });
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const response = await patch({ key: 'booking_payment_providers', value: bodyValue });

    expect(response.status).toBe(200);
    const auditCall = infoSpy.mock.calls.find(([label]) => label === '[admin-settings audit]');
    expect(auditCall).toBeDefined();
    expect(JSON.stringify(auditCall)).not.toContain(oldSecretApiKey);
    expect(JSON.stringify(auditCall)).not.toContain(secretApiKey);
    // Route log line and durable ledger (`pgSystemSettings.ts`) call the same shared redactor.
    expect(auditCall?.[1]).toMatchObject({
      newValue: redactSettingValueForAudit('booking_payment_providers', { value: bodyValue }),
    });
    infoSpy.mockRestore();
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

  it('commits the canonical workspace form once under the trusted organization', async () => {
    const composition = {
      version: 1,
      modules: {
        medical_record: true,
        encounters: true,
        rehabilitation: false,
        direct_chat: true,
        program_comments: true,
        program_media: true,
        mailings: false,
        analytics: true,
        client_portal: true,
        video_meetings: true,
      },
    };
    const defaults = {
      version: 1,
      channelDefaults: {
        direct_chat: 'all',
        program_comments: 'on_support',
        program_media: 'off',
      },
      patientSymptomTrackingDefault: 'on_support',
    };
    const items = [
      { key: 'doctor_workspace_composition', value: { value: composition } },
      { key: 'doctor_workspace_client_defaults', value: { value: defaults } },
      { key: 'patient_label', value: { value: 'клиент' } },
      { key: 'appointment_label', value: { value: 'тренировка' } },
      { key: 'support_group_label', value: { value: 'favorites' } },
    ];
    const saved = items.map((item) => ({
      key: item.key,
      scope: 'doctor',
      organizationId: CLINIC_ORGANIZATION_ID,
      valueJson: item.value,
      updatedAt: '2026-09-07T00:00:00.000Z',
      updatedBy: clinicSession.user.userId,
    }));
    fakes.persistSettingsBatch.mockResolvedValue(saved);

    const response = await patch({ items });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, settings: saved });
    expect(fakes.persistSettingsBatch).toHaveBeenCalledOnce();
    expect(fakes.persistSettingsBatch).toHaveBeenCalledWith(
      items.map((item) => ({ key: item.key, scope: 'doctor', value: item.value })),
      clinicSession.user.userId,
      { organizationId: CLINIC_ORGANIZATION_ID },
    );
  });

  it('rejects a malformed workspace value before the atomic writer is reached', async () => {
    const response = await patch({
      items: [
        {
          key: 'doctor_workspace_composition',
          value: { value: { version: 1, modules: { analytics: 'yes' } } },
        },
        {
          key: 'doctor_workspace_client_defaults',
          value: {
            value: {
              version: 1,
              channelDefaults: {
                direct_chat: 'all',
                program_comments: 'all',
                program_media: 'all',
              },
              patientSymptomTrackingDefault: 'all',
            },
          },
        },
        { key: 'patient_label', value: { value: 'клиент' } },
        { key: 'appointment_label', value: { value: 'сеанс' } },
        { key: 'support_group_label', value: { value: 'favorites' } },
      ],
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'invalid_value',
      key: 'doctor_workspace_composition',
    });
    expect(fakes.persistSettingsBatch).not.toHaveBeenCalled();
  });

  it('resets a saved clinic channel to pending until a new live probe succeeds', async () => {
    const response = await patch({
      key: 'clinic_telegram_bot_token',
      value: { value: 'new-token' },
    });

    expect(response.status).toBe(200);
    expect(fakes.updateSetting).toHaveBeenCalledWith(
      'clinic_telegram_bot_token',
      'admin',
      { value: 'new-token', deliveryReadiness: { status: 'pending' } },
      clinicSession.user.userId,
      { organizationId: CLINIC_ORGANIZATION_ID },
    );
  });

  it('computes the fixed app label server-side and ignores a browser-supplied prefix', async () => {
    fakes.setCustomDomainIntent.mockImplementationOnce(
      async (input: SetCustomDomainIntentInput) => ({
        ok: true,
        state: {
          organizationId: input.organizationId,
          baseDomain: input.baseDomain,
          placement: input.placement,
          subdomainLabel: input.placement === 'subdomain' ? 'app' : null,
          hostname:
            input.placement === 'subdomain' ? `app.${input.baseDomain}` : input.baseDomain,
          status: 'pending',
          statusReason: null,
          activatedAt: null,
        },
      }),
    );
    const response = await patch({
      key: 'org_custom_domain_hostname',
      value: {
        value: 'Clinic.Example.Test',
        placement: 'subdomain',
        subdomainLabel: 'browser-controlled',
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      domainBinding: {
        baseDomain: 'clinic.example.test',
        placement: 'subdomain',
        hostname: 'app.clinic.example.test',
        status: 'pending',
      },
    });
    expect(fakes.setCustomDomainIntent.mock.calls.at(-1)).toEqual([
      {
        organizationId: CLINIC_ORGANIZATION_ID,
        baseDomain: 'clinic.example.test',
        placement: 'subdomain',
      },
    ]);
  });

  it('rejects the platform-owned patient namespace as a clinic custom-domain intent', async () => {
    const response = await patch({
      key: 'org_custom_domain_hostname',
      value: { value: 'victim-clinic.therapygo.ru', placement: 'apex' },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
    expect(fakes.updateSetting).not.toHaveBeenCalled();
    expect(fakes.setCustomDomainIntent).not.toHaveBeenCalled();
  });

  it('does not persist the settings row when the hostname claim loses uniqueness', async () => {
    fakes.setCustomDomainIntent.mockResolvedValueOnce({ ok: false, code: 'hostname_taken' });

    const response = await patch({
      key: 'org_custom_domain_hostname',
      value: { value: 'clinic.example.test', placement: 'apex' },
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'custom_domain_hostname_taken',
    });
    expect(fakes.updateSetting).not.toHaveBeenCalled();
  });

  it('keeps custom-domain mutation owner-only', async () => {
    fakes.requireClinic.mockResolvedValueOnce({
      ok: true,
      ctx: {
        organizationId: CLINIC_ORGANIZATION_ID,
        membershipRole: 'admin',
        session: clinicSession,
      },
    });

    const response = await patch({
      key: 'org_custom_domain_hostname',
      value: { value: 'clinic.example.test', placement: 'apex' },
    });

    expect(response.status).toBe(403);
    expect(fakes.updateSetting).not.toHaveBeenCalled();
    expect(fakes.setCustomDomainIntent).not.toHaveBeenCalled();
  });

  it('enforces the custom-domain entitlement at the mutation boundary', async () => {
    fakes.requireEntitlementForMutation.mockResolvedValueOnce({
      ok: false,
      reason: 'entitlement_required',
    });

    const response = await patch({
      key: 'org_custom_domain_hostname',
      value: { value: 'clinic.example.test', placement: 'apex' },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'entitlement_required',
      mechanic: 'custom_domain',
    });
    expect(fakes.updateSetting).not.toHaveBeenCalled();
    expect(fakes.setCustomDomainIntent).not.toHaveBeenCalled();
  });
});

describe('platform workspace settings refusal', () => {
  it('requires clinic organization context for the canonical workspace batch', async () => {
    const response = await patch({
      items: [
        {
          key: 'doctor_workspace_composition',
          value: { value: { version: 1, modules: {} } },
        },
        {
          key: 'doctor_workspace_client_defaults',
          value: {
            value: {
              version: 1,
              channelDefaults: {
                direct_chat: 'all',
                program_comments: 'all',
                program_media: 'all',
              },
              patientSymptomTrackingDefault: 'all',
            },
          },
        },
        { key: 'patient_label', value: { value: 'пациент' } },
        { key: 'appointment_label', value: { value: 'приём' } },
        { key: 'support_group_label', value: { value: 'on_support' } },
      ],
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'organization_context_required',
    });
    expect(fakes.persistSettingsBatch).not.toHaveBeenCalled();
  });
});
