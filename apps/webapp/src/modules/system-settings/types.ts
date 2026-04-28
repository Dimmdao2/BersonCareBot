/** Whitelist for `system_settings` keys. Same strings are mirrored to integrator DB after each `updateSetting` (see `service.ts`). */
export const ALLOWED_KEYS = [
  // Operational flags
  /** When true, manual merge allows two platform users with different integrator_user_id only after integrator canonical merge (same canonical users.id); see Stage 5 PLATFORM_USER_MERGE_V2. */
  "platform_user_merge_v2_enabled",
  /**
   * Integrator `linkedPhone`: how to combine `public.platform_users` vs legacy `integrator.contacts` (label=channel).
   * `public_then_contacts` (default) → COALESCE(public, contacts); `public_only` → onboarding if no public phone; `contacts_only` → emergency rollback.
   */
  "integrator_linked_phone_source",
  "patient_label",
  "sms_fallback_enabled",
  "debug_forward_to_admin",
  /** Полный сырой initData в логах webapp (journalctl) при открытии миниаппа (POST max-init / telegram-init). Выкл. на проде. Ключ исторический (раньше включали `/max-debug`). */
  "max_debug_page_enabled",
  "dev_mode",
  "important_fallback_delay_minutes",
  "integration_test_ids",
  // Non-secret runtime config
  /** Публичный origin веб-приложения (https://…), без завершающего /. Ссылки /app/… строятся от него. Fallback: env APP_BASE_URL. */
  "app_base_url",
  /** Публичная ссылка поддержки (HTTPS), например https://t.me/… */
  "support_contact_url",
  /** Имя бота для Telegram Login Widget (без @), публичный идентификатор виджета. */
  "telegram_login_bot_username",
  /** Публичный ник бота MAX (сегмент `max.ru/<nick>`), для диплинка привязки channel-link. */
  "max_login_bot_nickname",
  /** Ключ MAX Bot API (как `MAX_API_KEY` у интегратора) — валидация Mini App `initData` на webapp. */
  "max_bot_api_key",
  /** Публичная ссылка «Вход с VK ID» для экрана входа (OAuth / vk.me / мини-приложение — задаёт админ; UI кнопки — по мере подключения). */
  "vk_web_login_url",
  /** IANA-таймзона для отображения времени записей и слотов (например Europe/Moscow). */
  "app_display_timezone",
  /** Цель «коротких практик в день» на главной пациента (1–10), default 3. */
  "patient_home_daily_practice_target",
  /** Yandex OAuth (backend-only; не показывать в публичном login UI). */
  "yandex_oauth_client_id",
  "yandex_oauth_client_secret",
  "yandex_oauth_redirect_uri",
  /** Google Calendar OAuth + integration (admin scope; managed via Settings UI). */
  "google_client_id",
  "google_client_secret",
  "google_redirect_uri",
  "google_refresh_token",
  "google_calendar_id",
  "google_calendar_enabled",
  "google_connected_email",
  /** Redirect URI for public web login with Google (separate from calendar callback). */
  "google_oauth_login_redirect_uri",
  /** Sign in with Apple (Services ID, team, key, .p8 PEM, redirect). */
  "apple_oauth_client_id",
  "apple_oauth_team_id",
  "apple_oauth_key_id",
  "apple_oauth_private_key",
  "apple_oauth_redirect_uri",
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
