import type { OrgMechanic } from '@/modules/org-entitlements/types';
import type { SystemSetting, SystemSettingScope } from '@/modules/system-settings/types';
import type {
  SystemSettingsReadOptions,
  SystemSettingsWriteOptions,
} from '@/modules/system-settings/ports';
import { PATIENT_DEFAULT_PROMO_TREATMENT_PROGRAM_TEMPLATE_ID_KEY } from '@/modules/system-settings/patientDefaultPromoTreatmentProgramTemplate';
import { ORG_CUSTOM_DOMAIN_HOSTNAME_KEY } from '@/modules/system-settings/orgCustomDomainHostname';

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

const TARIFF_MECHANIC_SETTING_KEYS: Partial<Record<string, readonly OrgMechanic[]>> = {
  booking_min_notice_hours: ['booking'],
  booking_max_consecutive_slot_hours: ['booking'],
  booking_payment_providers: ['payments'],
  booking_payment_enabled: ['payments'],
  google_refresh_token: ['external_calendar'],
  google_calendar_id: ['external_calendar'],
  google_calendar_enabled: ['external_calendar'],
  google_connected_email: ['external_calendar'],
  [PATIENT_DEFAULT_PROMO_TREATMENT_PROGRAM_TEMPLATE_ID_KEY]: ['promo'],
  clinic_smtp_outbound: ['clinic_smtp'],
  clinic_smsc_api_key: ['clinic_sms'],
  clinic_telegram_bot_token: ['clinic_telegram_bot'],
  clinic_max_bot_api_key: ['clinic_max_bot'],
  clinic_vk_community_access_token: ['clinic_vk_community'],
  [ORG_CUSTOM_DOMAIN_HOSTNAME_KEY]: ['custom_domain'],
};

function assertTariffMechanicSettingWriteClearance(
  key: string,
  assertWriteClearance: (mechanic: OrgMechanic) => void,
): void {
  const mechanics = TARIFF_MECHANIC_SETTING_KEYS[key];
  if (!mechanics) return;
  for (const mechanic of mechanics) {
    assertWriteClearance(mechanic);
  }
}

/**
 * 3.2 physical door for tariff-gated `system_settings` keys written via `updateSetting`.
 * Keys mirror the mutation guards in `admin/settings/route.ts` PATCH.
 */
export function wrapSystemSettingsServiceWithTariffMechanicWriteClearance<
  T extends SystemSettingsServiceLike,
>(service: T, assertWriteClearance: (mechanic: OrgMechanic) => void): T {
  return {
    ...service,
    async updateSetting(key, scope, value, updatedBy, options) {
      assertTariffMechanicSettingWriteClearance(key, assertWriteClearance);
      return service.updateSetting(key, scope, value, updatedBy, options);
    },
    async updateSettingIfUnchanged(key, scope, value, updatedBy, expectedUpdatedAt, options) {
      assertTariffMechanicSettingWriteClearance(key, assertWriteClearance);
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
