/**
 * Keys saved together from the admin Settings «Режимы» form.
 * Single source of truth for batch PATCH and client batch payload.
 */
export const MODES_FORM_KEYS = [
  "dev_mode",
  "debug_forward_to_admin",
  "max_debug_page_enabled",
  "important_fallback_delay_minutes",
  "platform_user_merge_v2_enabled",
  "integrator_linked_phone_source",
  "admin_phones",
  "admin_telegram_ids",
  "admin_max_ids",
  "test_account_identifiers",
  "patient_app_maintenance_enabled",
  "patient_app_maintenance_message",
  "patient_booking_url",
] as const;

export type ModesFormKey = (typeof MODES_FORM_KEYS)[number];

const MODES_FORM_KEY_SET = new Set<string>(MODES_FORM_KEYS);

export function isModesFormKey(key: string): key is ModesFormKey {
  return MODES_FORM_KEY_SET.has(key);
}
