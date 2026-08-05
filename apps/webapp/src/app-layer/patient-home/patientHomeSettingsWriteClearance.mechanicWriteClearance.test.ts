import { describe, expect, it, vi } from 'vitest';
import {
  MechanicWriteClearanceRequiredError,
  assertMechanicWriteClearance,
  enterWithMechanicWriteClearance,
  runWithoutMechanicWriteClearance,
} from '@/app-layer/entitlements/mechanicWriteClearance';
import { wrapSystemSettingsServiceWithPatientHomeWriteClearance } from './patientHomeSettingsWriteClearance';

function buildWrappedService() {
  const updateSetting = vi.fn(async (..._args: unknown[]) => ({ id: 'row-1' }) as never);
  const base = {
    getSetting: vi.fn(async () => null),
    updateSetting,
    updateSettingIfUnchanged: vi.fn(async () => null),
  };
  const wrapped = wrapSystemSettingsServiceWithPatientHomeWriteClearance(
    base,
    assertMechanicWriteClearance,
  );
  return { wrapped, updateSetting };
}

describe('patient home settings write clearance — 3.2 physical door', () => {
  it('refuses patient_home_mood_icons write without patient_home_today clearance', async () => {
    const { wrapped, updateSetting } = buildWrappedService();
    await runWithoutMechanicWriteClearance(async () => {
      await expect(
        wrapped.updateSetting('patient_home_mood_icons', 'admin', { value: [] }, 'user-1', {
          organizationId: 'org-1',
        }),
      ).rejects.toBeInstanceOf(MechanicWriteClearanceRequiredError);
    });
    expect(updateSetting).not.toHaveBeenCalled();
  });

  it('requires both patient_home_today and warmups for warmup cooldown keys', async () => {
    const { wrapped, updateSetting } = buildWrappedService();
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('patient_home_today');
      await expect(
        wrapped.updateSetting(
          'patient_home_daily_warmup_repeat_cooldown_minutes',
          'admin',
          { value: 60 },
          'user-1',
          { organizationId: 'org-1' },
        ),
      ).rejects.toBeInstanceOf(MechanicWriteClearanceRequiredError);
    });
    expect(updateSetting).not.toHaveBeenCalled();
  });

  it('proceeds when all required mechanics were cleared for the key', async () => {
    const { wrapped, updateSetting } = buildWrappedService();
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('patient_home_today');
      enterWithMechanicWriteClearance('warmups');
      await wrapped.updateSetting(
        'patient_home_daily_warmup_repeat_cooldown_minutes',
        'admin',
        { value: 60 },
        'user-1',
        { organizationId: 'org-1' },
      );
    });
    expect(updateSetting).toHaveBeenCalledOnce();
  });
});
