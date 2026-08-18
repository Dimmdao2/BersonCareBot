import type { OrgMechanic } from '@/modules/org-entitlements/types';
import type { SystemSetting, SystemSettingScope } from '@/modules/system-settings/types';
import type {
  SystemSettingsReadOptions,
  SystemSettingsWriteOptions,
} from '@/modules/system-settings/ports';

type SystemSettingsServiceLike = {
  getSetting(
    key: string,
    scope: SystemSettingScope,
    options?: SystemSettingsReadOptions,
  ): Promise<SystemSetting | null>;
  updateSetting(
    key: string,
    scope: SystemSettingScope,
    value: unknown,
    updatedBy: string | null,
    options?: SystemSettingsWriteOptions,
  ): Promise<SystemSetting>;
  updateSettingIfUnchanged(
    key: string,
    scope: SystemSettingScope,
    value: unknown,
    updatedBy: string | null,
    expectedUpdatedAt: string | null,
    options?: SystemSettingsWriteOptions,
  ): Promise<SystemSetting | null>;
};

const PATIENT_HOME_SETTING_MECHANICS: Partial<Record<string, readonly OrgMechanic[]>> = {
  patient_home_daily_practice_target: ['patient_home_today'],
  patient_home_daily_warmup_repeat_cooldown_minutes: ['patient_home_today', 'warmups'],
  patient_treatment_plan_item_done_repeat_cooldown_minutes: ['patient_home_today', 'warmups'],
  patient_home_daily_warmup_rotation_enabled: ['patient_home_today', 'warmups'],
  patient_home_daily_warmup_rotation_times: ['patient_home_today', 'warmups'],
};

function assertPatientHomeSettingWriteClearance(
  key: string,
  assertWriteClearance: (mechanic: OrgMechanic) => void,
): void {
  const mechanics = PATIENT_HOME_SETTING_MECHANICS[key];
  if (!mechanics) return;
  for (const mechanic of mechanics) {
    assertWriteClearance(mechanic);
  }
}

/**
 * 3.2 physical door for per-org `patient_home_*` settings written via `systemSettings.updateSetting`.
 * Keys map to the same mechanics the mutation guards clear before calling the service.
 */
export function wrapSystemSettingsServiceWithPatientHomeWriteClearance<
  T extends SystemSettingsServiceLike,
>(service: T, assertWriteClearance: (mechanic: OrgMechanic) => void): T {
  return {
    ...service,
    async updateSetting(key, scope, value, updatedBy, options) {
      assertPatientHomeSettingWriteClearance(key, assertWriteClearance);
      return service.updateSetting(key, scope, value, updatedBy, options);
    },
    async updateSettingIfUnchanged(key, scope, value, updatedBy, expectedUpdatedAt, options) {
      assertPatientHomeSettingWriteClearance(key, assertWriteClearance);
      return service.updateSettingIfUnchanged(
        key,
        scope,
        value,
        updatedBy,
        expectedUpdatedAt,
        options,
      );
    },
  };
}
