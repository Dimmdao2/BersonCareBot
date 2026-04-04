/** Whitelist for `system_settings` keys. Same strings are mirrored to integrator DB after each `updateSetting` (see `service.ts`). */
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
  /** Имя бота для Telegram Login Widget (без @), публичный идентификатор виджета. */
  "telegram_login_bot_username",
  /** IANA-таймзона для отображения времени записей и слотов (например Europe/Moscow). */
  "app_display_timezone",
  /** Yandex OAuth (backend-only; не показывать в публичном login UI). */
  "yandex_oauth_client_id",
  "yandex_oauth_client_secret",
  "yandex_oauth_redirect_uri",
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
