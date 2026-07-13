import { ALLOWED_KEYS, type SystemSettingKey } from "./types";

/**
 * P0.11.3 — org-aware write classification for every `system_settings` key.
 *
 * SINGLE SOURCE OF TRUTH for whether a setting is edited PER-ORGANIZATION (each clinic has its own
 * row, `organization_id = <org>`) or stays PLATFORM-GLOBAL (one row, `organization_id IS NULL`,
 * shared by every clinic — role allowlists, infra/rollout switches, signing keys, OAuth app
 * credentials). Nothing outside this file decides that; `createSystemSettingsService` (`service.ts`)
 * is the only reader and it is the only place org-aware writes are enforced (single chokepoint).
 *
 * `Record<SystemSettingKey, ...>` is intentionally EXHAUSTIVE over {@link ALLOWED_KEYS} — TypeScript
 * fails the build if a new key is added to `ALLOWED_KEYS` without an explicit classification here.
 * Default posture for anything genuinely ambiguous is GLOBAL (safer: no accidental per-clinic fork of
 * a platform setting) — see "AMBIGUOUS — kept GLOBAL, flagged for owner review" below.
 *
 * Owner-confirmed guidance (2026-07-13, P0.11.3):
 *  - PER-ORG: broadcast/notification message templates, client/patient display settings, the promo
 *    treatment-program default, notification texts, booking-engine clinic config
 *    (locations/payments/booking-rules/public-form texts).
 *  - GLOBAL: role allowlists (admin/doctor phones/telegram/max), app_base_url, dev_mode,
 *    patient_app_maintenance_*, smtp_outbound, OAuth redirect/secrets, test_account_identifiers,
 *    signing/infra keys.
 */
export type SystemSettingsOrgScope = "per_org" | "global";

export const SYSTEM_SETTINGS_ORG_SCOPE: Readonly<Record<SystemSettingKey, SystemSettingsOrgScope>> = {
  // --- Operational / infra flags — platform-wide behavior, not clinic-facing ---
  platform_user_merge_v2_enabled: "global",
  integrator_linked_phone_source: "global",

  // --- Doctor-scope clinic settings (scope="doctor") ---
  // AMBIGUOUS, kept GLOBAL: read on the pre-org-context OTP/login fallback path (auth/loginAlternativesConfig.ts,
  // configAdapter.getSmsFallbackEnabled reads scopes ["doctor","admin"] with no org) — no clean org resolution
  // point before a session/membership exists. Flag for owner review if per-clinic SMS fallback is wanted later.
  sms_fallback_enabled: "global",
  patient_label: "per_org", // clinic terminology ("Пациенты" vs "Клиенты") — client/patient display setting.
  doctor_patient_support_comments_without_support_default_enabled: "per_org",
  doctor_patient_support_media_without_support_default_enabled: "per_org",
  doctor_specialist_task_reminder_channels: "per_org",
  doctor_appointment_reminder_enabled: "per_org",
  doctor_appointment_reminder_offsets_minutes: "per_org",

  // --- Operational / debug flags ---
  debug_forward_to_admin: "global",
  max_debug_page_enabled: "global",
  dev_mode: "global", // owner-explicit GLOBAL example.
  // AMBIGUOUS, kept GLOBAL: no runtime consumer found (grep) beyond the "Режимы" UI/whitelist — orphan key.
  important_fallback_delay_minutes: "global",
  integration_test_ids: "global", // legacy, admin scope only, explicitly documented as compat.
  test_account_identifiers: "global", // owner-explicit GLOBAL example.

  // --- Non-secret platform runtime config (single Telegram/MAX/VK bot, single app origin) ---
  app_base_url: "global", // owner-explicit GLOBAL example.
  // AMBIGUOUS, kept GLOBAL: served on an unauthenticated public route (/api/public/support-contact-url) with
  // no org context available pre-login. Flag for owner review if subdomain/tenant-aware public routing lands.
  support_contact_url: "global",
  telegram_login_bot_username: "global", // one Telegram bot for the whole platform.
  max_login_bot_nickname: "global", // one MAX bot for the whole platform.
  max_bot_api_key: "global", // signing/infra key.
  vk_web_login_url: "global", // platform login mechanism.
  // AMBIGUOUS, kept GLOBAL: read on dozens of paths incl. cron/background jobs (reminders, warmup rotation,
  // web-push, product-analytics) with no org threaded today — a per-clinic TZ split is a much bigger initiative.
  app_display_timezone: "global",

  // --- Patient home / patient-facing display+behavior (clinic-facing) ---
  patient_home_daily_practice_target: "per_org",
  patient_default_promo_treatment_program_template_id: "per_org", // owner-explicit PER-ORG example.
  patient_home_morning_ping_enabled: "per_org",
  patient_home_morning_ping_local_time: "per_org",
  patient_home_daily_warmup_rotation_enabled: "per_org",
  patient_home_daily_warmup_rotation_times: "per_org",

  // --- Patient-app maintenance mode — owner-explicit GLOBAL examples ---
  patient_app_maintenance_enabled: "global",
  patient_app_maintenance_message: "global",

  // --- Platform rollout / phased-feature flags — not clinic-facing ---
  specialist_signup_enabled: "global",
  patient_program_discussion_doctor_reply_from_log_enabled: "global",
  patient_program_discussion_ui_enabled: "global",
  patient_program_discussion_media_submission_enabled: "global",

  // --- Video/HLS pipeline — infra, applies uniformly ---
  video_hls_pipeline_enabled: "global",
  video_hls_new_uploads_auto_transcode: "global",
  video_hls_reconcile_enabled: "global",
  video_playback_api_enabled: "global",
  video_default_delivery: "global",
  video_presign_ttl_seconds: "global",
  video_watermark_enabled: "global",

  // --- Booking-engine clinic config ---
  patient_booking_url: "per_org", // owner-explicit example (public booking link is clinic-specific).
  // AMBIGUOUS, kept GLOBAL: literally an org-id pointer for the legacy single-tenant canonical-model
  // migration; the concept itself doesn't generalize to "per clinic". Flag for owner review/removal.
  booking_default_organization_id: "global",
  // AMBIGUOUS, kept GLOBAL: data-source rollout switches read on nearly every appointment/slot read
  // path (incl. background/cron, integrator bridge) without org-threading audited in this task —
  // forking these per clinic before full canonical parity is high-risk. Flag for owner review.
  booking_rubitime_bridge_enabled: "global",
  booking_doctor_appointments_read_source: "global",
  booking_slots_read_source: "global",
  booking_calendar_show_working_hours: "per_org",
  booking_calendar_default_window: "per_org",
  booking_calendar_default_branch_id: "per_org",
  booking_calendar_default_service_id: "per_org",
  booking_payment_enabled: "per_org", // owner-explicit example (booking-rules/payments).
  booking_payment_providers: "per_org", // owner-explicit example (per-clinic merchant credentials).
  booking_lifecycle_notifications: "per_org",
  booking_allow_doctor_unlink_past_package_sessions: "per_org",
  booking_min_notice_hours: "per_org",

  // --- Patient home cooldowns / icons (clinic-facing display+behavior) ---
  patient_home_daily_warmup_repeat_cooldown_minutes: "per_org",
  patient_treatment_plan_item_done_repeat_cooldown_minutes: "per_org",
  // AMBIGUOUS, kept GLOBAL: @deprecated legacy compat parser only, not read by the active pick-of-day flow.
  patient_home_warmup_skip_to_next_available_enabled: "global",
  patient_home_mood_icons: "per_org",

  // --- Notification content ---
  notifications_topics: "per_org",

  // --- Infra / signing / secrets — owner-explicit GLOBAL examples ---
  smtp_outbound: "global",
  web_push_vapid: "global", // signing key pair.

  // --- Operator/ops alerting — internal ops, not clinic-facing ---
  admin_incident_alert_config: "global",
  operator_health_alert_config: "global",
  operator_health_projection_thresholds: "global",

  // --- Notification templates — owner-explicit PER-ORG examples ---
  "notif_template:created:patient": "per_org",
  "notif_template:created:doctor": "per_org",
  "notif_template:cancelled:patient": "per_org",
  "notif_template:cancelled:doctor": "per_org",
  "notif_template:rescheduled:patient": "per_org",
  "notif_template:rescheduled:doctor": "per_org",

  // --- OAuth app credentials — owner-explicit GLOBAL examples (one app registration for the platform) ---
  yandex_oauth_client_id: "global",
  yandex_oauth_client_secret: "global",
  yandex_oauth_redirect_uri: "global",
  google_client_id: "global",
  google_client_secret: "global",
  google_redirect_uri: "global",
  // AMBIGUOUS, kept GLOBAL: these four represent ONE connected Google Calendar instance, which is
  // conceptually per-clinic — but the calendar-sync worker/cron paths were not audited for org-threading
  // in this task. Flag for owner review as a follow-up (candidate for per-org in a later phase).
  google_refresh_token: "global",
  google_calendar_id: "global",
  google_calendar_enabled: "global",
  google_connected_email: "global",
  google_oauth_login_redirect_uri: "global",
  apple_oauth_client_id: "global",
  apple_oauth_team_id: "global",
  apple_oauth_key_id: "global",
  apple_oauth_private_key: "global",
  apple_oauth_redirect_uri: "global",

  // --- Role allowlists — owner-explicit GLOBAL examples ---
  allowed_telegram_ids: "global",
  allowed_max_ids: "global",
  admin_telegram_ids: "global",
  doctor_telegram_ids: "global",
  admin_max_ids: "global",
  doctor_max_ids: "global",
  admin_phones: "global",
  doctor_phones: "global",
  allowed_phones: "global",
} as const;

export function isPerOrgSettingKey(key: string): boolean {
  return SYSTEM_SETTINGS_ORG_SCOPE[key as SystemSettingKey] === "per_org";
}

/**
 * Thrown by `createSystemSettingsService` when a PER-ORG key is written without a resolvable
 * organization context. Callers (route handlers) must catch this and respond with an explicit error —
 * silently falling back to a global write would overwrite the platform default for every clinic.
 */
export class SystemSettingsOrgContextRequiredError extends Error {
  readonly key: string;
  constructor(key: string) {
    super(`organization_context_required: per-org setting "${key}" was written without an organizationId`);
    this.name = "SystemSettingsOrgContextRequiredError";
    this.key = key;
  }
}
