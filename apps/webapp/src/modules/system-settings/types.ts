export const ALLOWED_KEYS = [
  // Operational flags
  "patient_label",
  "sms_fallback_enabled",
  "debug_forward_to_admin",
  "dev_mode",
  "important_fallback_delay_minutes",
  "integration_test_ids",
  // Non-secret runtime config
  /** Публичная ссылка поддержки (HTTPS), например https://t.me/… */
  "support_contact_url",
  /** IANA-таймзона для отображения времени записей и слотов (например Europe/Moscow). */
  "app_display_timezone",
  // Whitelist IDs
  "allowed_telegram_ids",
  "allowed_max_ids",
  "admin_telegram_ids",
  "doctor_telegram_ids",
  "admin_max_ids",
  "doctor_max_ids",
  "admin_phones",
  "doctor_phones",
  "allowed_phones",
] as const;

export type SystemSettingKey = (typeof ALLOWED_KEYS)[number];

export type SystemSettingScope = "global" | "doctor" | "admin";

export type SystemSetting = {
  key: SystemSettingKey;
  scope: SystemSettingScope;
  valueJson: unknown;
  updatedAt: string;
  updatedBy: string | null;
};
