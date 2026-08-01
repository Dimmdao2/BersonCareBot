/**
 * S5-0 settings reality lock.
 *
 * This is the only key registry. `types.ts` and `orgScopedKeys.ts` deliberately
 * derive their public compatibility exports from it. `storage` is the intended
 * read surface after the S5 split; `legacySource` records the current
 * compatibility reality while S5-3 has not moved the write chokepoint yet.
 */
export type SystemSettingScope = 'global' | 'doctor' | 'admin';
export type SystemSettingStorage = 'restricted' | 'runtime';
export type SystemSettingOwnership = 'global' | 'per_org';
export type SystemSettingAudience = 'server' | 'authenticated_client' | 'public';
export type SystemSettingValueContract =
  | 'boolean'
  | 'integer'
  | 'string'
  | 'string_list'
  | 'url'
  | 'uuid'
  | 'structured'
  | 'secret_envelope';

export type SystemSettingDefinition = Readonly<{
  scope: SystemSettingScope;
  storage: SystemSettingStorage;
  /** Current source remains system_settings until the S5-3 write migration. */
  legacySource: 'system_settings';
  ownership: SystemSettingOwnership;
  audience: SystemSettingAudience;
  valueContract: SystemSettingValueContract;
  defaultValue: string;
  clientSerialization: 'none' | 'raw' | 'redacted' | 'derived';
  safeProjection?: string;
}>;

const restricted = (
  scope: SystemSettingScope,
  ownership: SystemSettingOwnership,
  valueContract: SystemSettingValueContract,
  defaultValue = 'absent',
  clientSerialization: 'none' | 'redacted' | 'derived' = 'none',
  safeProjection?: string,
) =>
  ({
    scope,
    storage: 'restricted',
    legacySource: 'system_settings',
    ownership,
    audience: 'server',
    valueContract,
    defaultValue,
    clientSerialization,
    safeProjection,
  }) as const;

const runtime = (
  scope: SystemSettingScope,
  ownership: SystemSettingOwnership,
  audience: SystemSettingAudience,
  valueContract: SystemSettingValueContract,
  defaultValue: string,
) =>
  ({
    scope,
    storage: 'runtime',
    legacySource: 'system_settings',
    ownership,
    audience,
    valueContract,
    defaultValue,
    clientSerialization: audience === 'server' ? 'none' : 'raw',
  }) as const;

/** Every legacy SystemSettingKey is classified here; no fallback entry exists. */
export const SYSTEM_SETTING_REGISTRY = {
  error_tracking_enabled: runtime('admin', 'global', 'server', 'boolean', 'false'),
  error_tracking_dsn: runtime('admin', 'global', 'server', 'url', ''),
  platform_user_merge_v2_enabled: runtime('admin', 'global', 'server', 'boolean', 'false'),
  /** Platform-wide product switch, deliberately not a per-tariff mechanic. */
  material_ratings_enabled: runtime('admin', 'global', 'server', 'boolean', 'false'),
  integrator_linked_phone_source: runtime(
    'admin',
    'global',
    'server',
    'string',
    'public_then_contacts',
  ),
  patient_label: runtime('doctor', 'per_org', 'authenticated_client', 'string', 'Пациенты'),
  sms_fallback_enabled: restricted(
    'doctor',
    'global',
    'boolean',
    'false',
    'derived',
    'public_sms_fallback_enabled',
  ),
  smsc_enabled: restricted('admin', 'global', 'boolean', 'false'),
  smsc_api_key: restricted('admin', 'global', 'secret_envelope', 'absent', 'redacted'),
  doctor_patient_support_comments_without_support_default_enabled: runtime(
    'doctor',
    'per_org',
    'authenticated_client',
    'boolean',
    'false',
  ),
  doctor_patient_support_media_without_support_default_enabled: runtime(
    'doctor',
    'per_org',
    'authenticated_client',
    'boolean',
    'false',
  ),
  doctor_specialist_task_reminder_channels: runtime(
    'doctor',
    'per_org',
    'server',
    'structured',
    '{channels:[]}',
  ),
  doctor_today_preferences: runtime(
    'doctor',
    'per_org',
    'server',
    'structured',
    '{"visibleProactiveInsightKinds":["wellbeing_low_streak","program_inactivity"],"peopleListMode":"on_support"}',
  ),
  doctor_appointment_reminder_enabled: runtime('doctor', 'per_org', 'server', 'boolean', 'false'),
  doctor_appointment_reminder_offsets_minutes: runtime(
    'doctor',
    'per_org',
    'server',
    'structured',
    '[]',
  ),
  debug_forward_to_admin: runtime('admin', 'global', 'server', 'boolean', 'false'),
  max_debug_page_enabled: restricted('admin', 'global', 'boolean', 'false'),
  dev_mode: restricted('admin', 'global', 'boolean', 'false'),
  important_fallback_delay_minutes: runtime('admin', 'global', 'server', 'integer', 'absent'),
  integration_test_ids: restricted('admin', 'global', 'string_list', '[]'),
  test_account_identifiers: restricted('admin', 'global', 'structured', 'absent'),
  support_contact_url: runtime('admin', 'global', 'public', 'url', ''),
  telegram_login_bot_username: runtime('admin', 'global', 'public', 'string', ''),
  max_login_bot_nickname: runtime('admin', 'global', 'public', 'string', ''),
  max_bot_api_key: restricted('admin', 'global', 'secret_envelope'),
  vk_web_login_url: runtime('admin', 'global', 'public', 'url', ''),
  app_display_timezone: runtime('admin', 'global', 'public', 'string', 'Europe/Moscow'),
  patient_home_daily_practice_target: runtime(
    'admin',
    'per_org',
    'authenticated_client',
    'integer',
    '3',
  ),
  patient_default_promo_treatment_program_template_id: runtime(
    'admin',
    'per_org',
    'authenticated_client',
    'uuid',
    'absent',
  ),
  patient_home_daily_warmup_rotation_enabled: runtime(
    'admin',
    'per_org',
    'authenticated_client',
    'boolean',
    'false',
  ),
  patient_home_daily_warmup_rotation_times: runtime(
    'admin',
    'per_org',
    'authenticated_client',
    'structured',
    '[]',
  ),
  patient_app_maintenance_enabled: runtime(
    'admin',
    'global',
    'authenticated_client',
    'boolean',
    'false',
  ),
  patient_app_maintenance_message: runtime('admin', 'global', 'authenticated_client', 'string', ''),
  specialist_signup_enabled: runtime('admin', 'global', 'public', 'boolean', 'false'),
  patient_unsupported_client_fallback_enabled: runtime(
    'admin',
    'global',
    'public',
    'boolean',
    'false',
  ),
  auth_email_enabled: runtime('admin', 'global', 'public', 'boolean', 'true'),
  auth_sms_enabled: runtime('admin', 'global', 'public', 'boolean', 'false'),
  auth_telegram_enabled: runtime('admin', 'global', 'public', 'boolean', 'true'),
  auth_max_enabled: runtime('admin', 'global', 'public', 'boolean', 'true'),
  /**
   * Independent admin toggles for OAuth login providers — decoupled from credential presence.
   * `oauth_google_enabled` / `oauth_yandex_enabled` (below, restricted-derived) remain the
   * "configured" signal (all required credentials present); the effective client-visible /
   * server-enforced state is `auth_oauth_*_enabled AND oauth_*_enabled`. No Apple toggle
   * (owner ruling 2026-07-24) — Apple OAuth stays purely credential-derived.
   */
  auth_oauth_google_enabled: runtime('admin', 'global', 'public', 'boolean', 'true'),
  auth_oauth_yandex_enabled: runtime('admin', 'global', 'public', 'boolean', 'true'),
  auth_oauth_apple_enabled: runtime('admin', 'global', 'public', 'boolean', 'false'),
  auth_passkey_enabled: runtime('admin', 'global', 'public', 'boolean', 'false'),
  auth_pin_enabled: runtime('admin', 'global', 'public', 'boolean', 'false'),
  /**
   * Platform-wide availability of clinic-facing integrations. This is deliberately one
   * structured setting: the platform decides whether an integration exists, while any
   * clinic-owned credentials remain organization-scoped and tariff-gated.
   */
  platform_integration_availability: runtime(
    'admin',
    'global',
    'server',
    'structured',
    '{"version":1,"integrations":{"telegram":true,"max":true,"email":true,"smsc":true,"web_push":true,"google_calendar":true,"yandex_calendar":false}}',
  ),
  /**
   * Global admin switch: when true, staff (global-admin + specialists) must complete TOTP
   * enrollment/verification to keep using protected staff surfaces (owner ruling 2026-07-24).
   * Server-only audience — enforcement reads happen in `app-layer/guards/requireRole.ts`, never
   * the browser. Default false preserves today's per-user opt-in behavior until an admin opts in.
   */
  auth_2fa_enabled: runtime('admin', 'global', 'server', 'boolean', 'false'),
  patient_program_discussion_doctor_reply_from_log_enabled: runtime(
    'admin',
    'global',
    'authenticated_client',
    'boolean',
    'false',
  ),
  patient_program_discussion_ui_enabled: runtime(
    'admin',
    'global',
    'authenticated_client',
    'boolean',
    'false',
  ),
  patient_program_discussion_media_submission_enabled: runtime(
    'admin',
    'global',
    'authenticated_client',
    'boolean',
    'false',
  ),
  video_hls_pipeline_enabled: runtime('admin', 'global', 'server', 'boolean', 'false'),
  video_hls_new_uploads_auto_transcode: runtime('admin', 'global', 'server', 'boolean', 'false'),
  video_hls_reconcile_enabled: runtime('admin', 'global', 'server', 'boolean', 'false'),
  video_playback_api_enabled: runtime(
    'admin',
    'global',
    'authenticated_client',
    'boolean',
    'false',
  ),
  video_default_delivery: runtime('admin', 'global', 'authenticated_client', 'string', 'auto'),
  video_presign_ttl_seconds: runtime('admin', 'global', 'server', 'integer', '3600'),
  video_watermark_enabled: runtime('admin', 'global', 'server', 'boolean', 'false'),
  patient_booking_url: runtime('admin', 'per_org', 'authenticated_client', 'url', ''),
  booking_default_organization_id: restricted('admin', 'global', 'uuid'),
  booking_calendar_show_working_hours: runtime(
    'admin',
    'per_org',
    'authenticated_client',
    'boolean',
    'false',
  ),
  booking_calendar_default_window: runtime(
    'doctor',
    'per_org',
    'authenticated_client',
    'structured',
    'absent',
  ),
  booking_calendar_default_branch_id: runtime(
    'doctor',
    'per_org',
    'authenticated_client',
    'uuid',
    'absent',
  ),
  booking_calendar_default_service_id: runtime(
    'doctor',
    'per_org',
    'authenticated_client',
    'uuid',
    'absent',
  ),
  booking_calendar_default_specialist_id: runtime(
    'doctor',
    'per_org',
    'authenticated_client',
    'uuid',
    'absent',
  ),
  booking_location_default_palette: runtime(
    'admin',
    'global',
    'server',
    'structured',
    '{"physicalPalette":["#2563EB","#16A34A","#F59E0B","#DC2626","#7C3AED"],"online":"#7C3AED"}',
  ),
  booking_payment_enabled: runtime('admin', 'per_org', 'authenticated_client', 'boolean', 'false'),
  booking_payment_providers: restricted(
    'admin',
    'per_org',
    'secret_envelope',
    'yookassa',
    'redacted',
    'booking_payment_public_config',
  ),
  saas_billing_payment_provider: restricted(
    'admin',
    'global',
    'secret_envelope',
    'yookassa',
    'redacted',
  ),
  booking_lifecycle_notifications: runtime('admin', 'per_org', 'server', 'boolean', 'false'),
  booking_allow_doctor_unlink_past_package_sessions: runtime(
    'admin',
    'per_org',
    'server',
    'boolean',
    'false',
  ),
  booking_min_notice_hours: runtime('admin', 'per_org', 'server', 'integer', '0'),
  booking_max_consecutive_slot_hours: runtime('admin', 'per_org', 'server', 'integer', '3'),
  patient_home_daily_warmup_repeat_cooldown_minutes: runtime(
    'admin',
    'per_org',
    'authenticated_client',
    'integer',
    '60',
  ),
  patient_treatment_plan_item_done_repeat_cooldown_minutes: runtime(
    'admin',
    'per_org',
    'authenticated_client',
    'integer',
    '60',
  ),
  patient_home_warmup_skip_to_next_available_enabled: runtime(
    'admin',
    'global',
    'server',
    'boolean',
    'false',
  ),
  patient_home_mood_icons: runtime('admin', 'per_org', 'authenticated_client', 'structured', '[]'),
  notifications_topics: runtime('admin', 'per_org', 'authenticated_client', 'structured', '[]'),
  smtp_outbound: restricted('admin', 'global', 'secret_envelope', 'absent', 'redacted'),
  operator_health_imap: restricted('admin', 'global', 'secret_envelope', 'absent', 'redacted'),
  web_push_vapid: restricted(
    'admin',
    'global',
    'secret_envelope',
    'absent',
    'redacted',
    'web_push_vapid_public_key',
  ),
  admin_incident_alert_config: restricted('admin', 'global', 'structured'),
  operator_health_alert_config: restricted('admin', 'global', 'structured'),
  operator_alert_fallback_email: restricted('admin', 'global', 'string', 'absent'),
  operator_health_probe_config: runtime(
    'admin',
    'global',
    'server',
    'structured',
    '{"max":{"enabled":true,"intervalMs":600000,"timeoutMs":5000,"consecutiveFailures":2},"telegram":{"enabled":true,"intervalMs":600000,"timeoutMs":5000,"consecutiveFailures":2},"google_calendar":{"enabled":true,"intervalMs":600000,"timeoutMs":5000,"consecutiveFailures":2},"email":{"intervalMs":900000,"timeoutMs":60000,"roundTripDeadlineMs":300000,"retentionMs":604800000,"cleanupIntervalMs":86400000},"quietWindowMaxDurationMs":86400000,"quietUntil":null}',
  ),
  operator_health_projection_thresholds: runtime(
    'admin',
    'global',
    'server',
    'structured',
    'absent',
  ),
  'notif_template:created:patient': runtime(
    'admin',
    'per_org',
    'server',
    'string',
    'hardcoded fallback',
  ),
  'notif_template:created:doctor': runtime(
    'admin',
    'per_org',
    'server',
    'string',
    'hardcoded fallback',
  ),
  'notif_template:cancelled:patient': runtime(
    'admin',
    'per_org',
    'server',
    'string',
    'hardcoded fallback',
  ),
  'notif_template:cancelled:doctor': runtime(
    'admin',
    'per_org',
    'server',
    'string',
    'hardcoded fallback',
  ),
  'notif_template:rescheduled:patient': runtime(
    'admin',
    'per_org',
    'server',
    'string',
    'hardcoded fallback',
  ),
  'notif_template:rescheduled:doctor': runtime(
    'admin',
    'per_org',
    'server',
    'string',
    'hardcoded fallback',
  ),
  yandex_oauth_client_id: restricted(
    'admin',
    'global',
    'secret_envelope',
    'absent',
    'derived',
    'oauth_yandex_enabled',
  ),
  yandex_oauth_client_secret: restricted(
    'admin',
    'global',
    'secret_envelope',
    'absent',
    'derived',
    'oauth_yandex_enabled',
  ),
  yandex_oauth_redirect_uri: restricted(
    'admin',
    'global',
    'url',
    'absent',
    'derived',
    'oauth_yandex_enabled',
  ),
  vk_id_application_id: restricted('admin', 'global', 'secret_envelope'),
  vk_id_client_secret: restricted('admin', 'global', 'secret_envelope', 'absent', 'redacted'),
  auth_altcha_hmac_secret: restricted(
    'admin',
    'global',
    'secret_envelope',
    'absent',
    'redacted',
  ),
  vk_id_redirect_uri: restricted('admin', 'global', 'url'),
  google_client_id: restricted('admin', 'global', 'secret_envelope'),
  google_client_secret: restricted('admin', 'global', 'secret_envelope'),
  google_redirect_uri: restricted('admin', 'global', 'url'),
  // OAuth application identity is platform-owned; each clinic owns the Google account and
  // calendar it authorizes. Do not restore a global fallback for these connection rows.
  google_refresh_token: restricted('admin', 'per_org', 'secret_envelope'),
  google_calendar_id: restricted('admin', 'per_org', 'string'),
  google_calendar_enabled: restricted('admin', 'per_org', 'boolean', 'false'),
  google_connected_email: restricted('admin', 'per_org', 'string'),
  google_oauth_login_redirect_uri: restricted(
    'admin',
    'global',
    'url',
    'absent',
    'derived',
    'oauth_google_enabled',
  ),
  apple_oauth_client_id: restricted(
    'admin',
    'global',
    'secret_envelope',
    'absent',
    'derived',
    'oauth_apple_enabled',
  ),
  apple_oauth_team_id: restricted(
    'admin',
    'global',
    'secret_envelope',
    'absent',
    'derived',
    'oauth_apple_enabled',
  ),
  apple_oauth_key_id: restricted(
    'admin',
    'global',
    'secret_envelope',
    'absent',
    'derived',
    'oauth_apple_enabled',
  ),
  apple_oauth_private_key: restricted(
    'admin',
    'global',
    'secret_envelope',
    'absent',
    'derived',
    'oauth_apple_enabled',
  ),
  apple_oauth_redirect_uri: restricted(
    'admin',
    'global',
    'url',
    'absent',
    'derived',
    'oauth_apple_enabled',
  ),
  allowed_telegram_ids: restricted('admin', 'global', 'string_list'),
  allowed_max_ids: restricted('admin', 'global', 'string_list'),
  admin_telegram_ids: restricted('admin', 'global', 'string_list'),
  doctor_telegram_ids: restricted('admin', 'global', 'string_list'),
  admin_max_ids: restricted('admin', 'global', 'string_list'),
  doctor_max_ids: restricted('admin', 'global', 'string_list'),
  admin_phones: restricted('admin', 'global', 'string_list'),
  /** Verified email OTP may promote only addresses explicitly listed here. */
  admin_emails: restricted('admin', 'global', 'string_list'),
  doctor_phones: restricted('admin', 'global', 'string_list'),
  allowed_phones: restricted('admin', 'global', 'string_list'),
  operator_heartbeat_config: restricted('admin', 'global', 'structured', 'absent'),
} as const satisfies Record<string, SystemSettingDefinition>;

export type SystemSettingKey = keyof typeof SYSTEM_SETTING_REGISTRY;

export const ALLOWED_KEYS = Object.freeze(
  Object.keys(SYSTEM_SETTING_REGISTRY) as SystemSettingKey[],
);

export const RUNTIME_SYSTEM_SETTING_KEYS = Object.freeze(
  ALLOWED_KEYS.filter((key) => SYSTEM_SETTING_REGISTRY[key].storage === 'runtime'),
);

export const RESTRICTED_SYSTEM_SETTING_KEYS = Object.freeze(
  ALLOWED_KEYS.filter((key) => SYSTEM_SETTING_REGISTRY[key].storage === 'restricted'),
);

export type RuntimeFlagSource =
  | Readonly<{ kind: 'setting'; setting: SystemSettingKey }>
  | Readonly<{ kind: 'mechanic'; mechanic: 'booking' | 'payments' | 'patient_app' }>
  | Readonly<{ kind: 'all'; sources: readonly RuntimeFlagSource[] }>;

export type RuntimeFlagDefinition = Readonly<{
  source: RuntimeFlagSource;
  /** Documentation only in S5-0; S5-4 evaluates mechanics after accepted S4 merge. */
  evaluation: 'deferred_until_s4_merge';
}>;

export const RUNTIME_FLAG_DEFINITIONS = {
  discussion: {
    source: { kind: 'setting', setting: 'patient_program_discussion_ui_enabled' },
    evaluation: 'deferred_until_s4_merge',
  },
  booking: {
    source: { kind: 'mechanic', mechanic: 'booking' },
    evaluation: 'deferred_until_s4_merge',
  },
  payments: {
    source: {
      kind: 'all',
      sources: [
        { kind: 'mechanic', mechanic: 'payments' },
        { kind: 'setting', setting: 'booking_payment_enabled' },
      ],
    },
    evaluation: 'deferred_until_s4_merge',
  },
  patient_app: {
    source: { kind: 'mechanic', mechanic: 'patient_app' },
    evaluation: 'deferred_until_s4_merge',
  },
} as const satisfies Record<string, RuntimeFlagDefinition>;
