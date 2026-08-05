import { describe, expect, it, vi } from 'vitest';
import {
  MechanicWriteClearanceRequiredError,
  assertMechanicWriteClearance,
  enterWithMechanicWriteClearance,
  runWithoutMechanicWriteClearance,
} from '@/app-layer/entitlements/mechanicWriteClearance';
import { wrapSystemSettingsServiceWithTariffMechanicWriteClearance } from './mechanicSettingsWriteClearance';
import { PATIENT_DEFAULT_PROMO_TREATMENT_PROGRAM_TEMPLATE_ID_KEY } from '@/modules/system-settings/patientDefaultPromoTreatmentProgramTemplate';
import { ORG_CUSTOM_DOMAIN_HOSTNAME_KEY } from '@/modules/system-settings/orgCustomDomainHostname';

function buildWrappedService() {
  const updateSetting = vi.fn(async (..._args: unknown[]) => ({ id: 'row-1' }) as never);
  const base = {
    getSetting: vi.fn(async () => null),
    updateSetting,
    updateSettingIfUnchanged: vi.fn(async () => null),
  };
  const wrapped = wrapSystemSettingsServiceWithTariffMechanicWriteClearance(
    base,
    assertMechanicWriteClearance,
  );
  return { wrapped, updateSetting };
}

describe('tariff mechanic settings write clearance — 3.2 physical door', () => {
  it('refuses booking_min_notice_hours write without booking clearance', async () => {
    const { wrapped, updateSetting } = buildWrappedService();
    await runWithoutMechanicWriteClearance(async () => {
      await expect(
        wrapped.updateSetting('booking_min_notice_hours', 'admin', { value: 2 }, 'user-1', {
          organizationId: 'org-1',
        }),
      ).rejects.toBeInstanceOf(MechanicWriteClearanceRequiredError);
    });
    expect(updateSetting).not.toHaveBeenCalled();
  });

  it('proceeds for booking_min_notice_hours once booking was cleared', async () => {
    const { wrapped, updateSetting } = buildWrappedService();
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('booking');
      await wrapped.updateSetting('booking_min_notice_hours', 'admin', { value: 2 }, 'user-1', {
        organizationId: 'org-1',
      });
    });
    expect(updateSetting).toHaveBeenCalledOnce();
  });

  it('refuses booking_payment_enabled write without payments clearance', async () => {
    const { wrapped, updateSetting } = buildWrappedService();
    await runWithoutMechanicWriteClearance(async () => {
      await expect(
        wrapped.updateSetting('booking_payment_enabled', 'admin', { value: true }, 'user-1', {
          organizationId: 'org-1',
        }),
      ).rejects.toBeInstanceOf(MechanicWriteClearanceRequiredError);
    });
    expect(updateSetting).not.toHaveBeenCalled();
  });

  it('refuses google_refresh_token write without external_calendar clearance', async () => {
    const { wrapped, updateSetting } = buildWrappedService();
    await runWithoutMechanicWriteClearance(async () => {
      await expect(
        wrapped.updateSetting('google_refresh_token', 'admin', { value: 'token' }, 'user-1', {
          organizationId: 'org-1',
        }),
      ).rejects.toBeInstanceOf(MechanicWriteClearanceRequiredError);
    });
    expect(updateSetting).not.toHaveBeenCalled();
  });

  it('proceeds for promo template key once promo was cleared', async () => {
    const { wrapped, updateSetting } = buildWrappedService();
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('promo');
      await wrapped.updateSetting(
        PATIENT_DEFAULT_PROMO_TREATMENT_PROGRAM_TEMPLATE_ID_KEY,
        'admin',
        { value: '44444444-4444-4444-8444-444444444444' },
        'user-1',
        { organizationId: 'org-1' },
      );
    });
    expect(updateSetting).toHaveBeenCalledOnce();
  });

  it('refuses org_custom_domain_hostname write without custom_domain clearance', async () => {
    const { wrapped, updateSetting } = buildWrappedService();
    await runWithoutMechanicWriteClearance(async () => {
      await expect(
        wrapped.updateSetting(
          ORG_CUSTOM_DOMAIN_HOSTNAME_KEY,
          'admin',
          { value: 'clinic.example.com' },
          'user-1',
          { organizationId: 'org-1' },
        ),
      ).rejects.toBeInstanceOf(MechanicWriteClearanceRequiredError);
    });
    expect(updateSetting).not.toHaveBeenCalled();
  });

  it('proceeds for org_custom_domain_hostname once custom_domain was cleared', async () => {
    const { wrapped, updateSetting } = buildWrappedService();
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('custom_domain');
      await wrapped.updateSetting(
        ORG_CUSTOM_DOMAIN_HOSTNAME_KEY,
        'admin',
        { value: 'clinic.example.com' },
        'user-1',
        { organizationId: 'org-1' },
      );
    });
    expect(updateSetting).toHaveBeenCalledOnce();
  });
});
