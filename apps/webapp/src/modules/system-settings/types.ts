export const ALLOWED_KEYS = [
  // Operational flags
  "patient_label",
  "sms_fallback_enabled",
  "debug_forward_to_admin",
  "dev_mode",
  "important_fallback_delay_minutes",
  "integration_test_ids",
  // Non-secret runtime config keys (Pack B1)
  "integrator_api_url",
  "booking_url",
  /** Публичная ссылка поддержки (HTTPS), например https://t.me/… */
  "support_contact_url",
  "booking_display_timezone",
  "telegram_bot_username",
  "google_calendar_enabled",
  "google_calendar_id",
  "google_client_id",
  "google_client_secret",
  "google_redirect_uri",
  "google_refresh_token",
  "yandex_oauth_redirect_uri",
  "yandex_oauth_client_id",
  "yandex_oauth_client_secret",
  "telegram_bot_token",
  "integrator_webhook_secret",
  "integrator_webapp_entry_secret",
  "rubitime_api_key",
  "rubitime_webhook_token",
  "rubitime_schedule_mapping",
  "rubitime_webhook_uri",
  "max_api_key",
  "max_webhook_secret",
  "max_webhook_uri",
  "smsc_api_key",
  "smsc_webhook_uri",
  // Whitelist IDs (Pack B2)
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
