import {
  defaultSurfaceAuthControlEnabled,
  SURFACE_AUTH_CONTROLS,
  SURFACE_AUTH_POLICY_NAMES,
  surfaceAuthSettingKey,
  type SurfaceAuthSettingKey,
} from '@/modules/auth/surfaceAuthSettings';

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

/**
 * Redaction policy for `system_settings_audit` (and the equivalent admin log line) — the single
 * source `auditRedaction.ts` reads instead of a hand-maintained key list. `#1071`: an independent
 * audit found `web_push_vapid`, `booking_payment_providers` and `saas_billing_payment_provider`
 * carrying live secret material into the durable ledger unredacted, because the old denylist was
 * maintained by hand and nobody added them. Deriving from this typed field makes "forgot to add a
 * new secret key" a compile-time-adjacent registry omission instead of a silent leak: every
 * `secret_envelope` key defaults to `whole_value` (see `restricted()`) unless explicitly downgraded.
 *
 * - `none` — not a secret; passes through unredacted (the six public OAuth identifiers).
 * - `whole_value` — the entire `value` IS the credential (a bare string envelope).
 * - `object_field` — a composite envelope; only `value.<field>` is a credential.
 * - `domain_redactor` — a composite envelope whose secret-bearing shape already has a dedicated
 *   parser/redactor elsewhere (payment provider lists); reuse it instead of a second implementation.
 */
export type SystemSettingSecretAuditPolicy =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'whole_value' }>
  | Readonly<{ kind: 'object_field'; field: string }>
  | Readonly<{
      kind: 'domain_redactor';
      id: 'booking_payment_providers' | 'saas_billing_payment_provider';
    }>;

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
  secretAudit: SystemSettingSecretAuditPolicy;
}>;

const AUDIT_NONE: SystemSettingSecretAuditPolicy = { kind: 'none' };
const AUDIT_WHOLE_VALUE: SystemSettingSecretAuditPolicy = { kind: 'whole_value' };

/** Composite envelope where only `value.<field>` is a credential (e.g. `value.password`). */
const auditObjectField = (field: string): SystemSettingSecretAuditPolicy => ({
  kind: 'object_field',
  field,
});

/** Composite envelope whose secret shape reuses an existing domain parser/redactor. */
const auditDomainRedactor = (
  id: 'booking_payment_providers' | 'saas_billing_payment_provider',
): SystemSettingSecretAuditPolicy => ({ kind: 'domain_redactor', id });

/** Overrides the derived default — the only way `secret_envelope` escapes `whole_value`. */
const withSecretAudit = (
  def: SystemSettingDefinition,
  secretAudit: SystemSettingSecretAuditPolicy,
): SystemSettingDefinition => ({ ...def, secretAudit });

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
    // Fail-closed default: a new `secret_envelope` key is redacted whole until explicitly
    // proven public via `withSecretAudit(..., { kind: 'none' })` — see the registry census test.
    secretAudit: valueContract === 'secret_envelope' ? AUDIT_WHOLE_VALUE : AUDIT_NONE,
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
    // No runtime-storage key uses `secret_envelope` today (asserted by the registry census test).
    secretAudit: AUDIT_NONE,
  }) as const;

const surfaceAuthSettingDefinitions = Object.fromEntries(
  SURFACE_AUTH_POLICY_NAMES.flatMap((surface) =>
    SURFACE_AUTH_CONTROLS.map((control) => [
      surfaceAuthSettingKey(surface, control),
      runtime(
        'admin',
        'global',
        'public',
        'boolean',
        String(defaultSurfaceAuthControlEnabled(surface, control)),
      ),
    ]),
  ),
) as Readonly<Record<SurfaceAuthSettingKey, SystemSettingDefinition>>;

/** Every legacy SystemSettingKey is classified here; no fallback entry exists. */
export const SYSTEM_SETTING_REGISTRY = {
  error_tracking_enabled: runtime('admin', 'global', 'server', 'boolean', 'false'),
  error_tracking_dsn: runtime('admin', 'global', 'server', 'url', ''),
  /** Platform-wide product switch, deliberately not a per-tariff mechanic. */
  material_ratings_enabled: runtime('admin', 'global', 'server', 'boolean', 'true'),
  patient_label: runtime('doctor', 'per_org', 'authenticated_client', 'string', 'Пациенты'),
  sms_fallback_enabled: restricted(
    'doctor',
    'per_org',
    'boolean',
    'false',
    'derived',
    'public_sms_fallback_enabled',
  ),
  smsc_enabled: restricted('admin', 'global', 'boolean', 'false'),
  smsc_api_key: restricted('admin', 'global', 'secret_envelope', 'absent', 'redacted'),
  smsc_base_url: restricted('admin', 'global', 'url', 'absent'),
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
    '{"peopleListMode":"on_support"}',
  ),
  doctor_appointment_reminder_enabled: runtime('doctor', 'per_org', 'server', 'boolean', 'false'),
  doctor_appointment_reminder_offsets_minutes: runtime(
    'doctor',
    'per_org',
    'server',
    'structured',
    '[]',
  ),
  important_fallback_delay_minutes: runtime('admin', 'global', 'server', 'integer', 'absent'),
  support_contact_url: runtime('admin', 'global', 'public', 'url', ''),
  telegram_login_bot_username: runtime('admin', 'global', 'public', 'string', ''),
  max_login_bot_nickname: runtime('admin', 'global', 'public', 'string', ''),
  max_bot_api_key: restricted('admin', 'global', 'secret_envelope'),
  max_webhook_secret: restricted('admin', 'global', 'secret_envelope'),
  max_api_base_url: restricted('admin', 'global', 'url', 'absent'),
  vk_community_access_token: restricted('admin', 'global', 'secret_envelope'),
  vk_callback_secret: restricted('admin', 'global', 'secret_envelope'),
  vk_callback_confirmation_token: restricted('admin', 'global', 'secret_envelope'),
  /**
   * Сервисный токен VK API с правом `video` — только для получения обложки ролика
   * (`shared/lib/hostedVideoThumbnail.ts`). Это НЕ токен сообщества выше: `vk_community_access_token`
   * — Callback API бота для сообщений, `video.get` им не отвечает (замер 27.08: `error_code 5`).
   */
  vk_video_service_token: restricted('admin', 'global', 'secret_envelope'),
  telegram_bot_token: restricted('admin', 'global', 'secret_envelope'),
  telegram_webhook_secret: restricted('admin', 'global', 'secret_envelope'),
  telegram_mode: runtime('admin', 'global', 'server', 'string', 'long_polling'),
  telegram_send_menu_on_button_press: restricted('admin', 'global', 'boolean', 'false'),
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
  /**
   * Legacy declarations retain the defaults copied into the surface matrix on F4 migration.
   * Keep the matrix/live DEV set (email + passkey) because F4 must preserve today's login set;
   * these rows are compatibility data only and no longer decide login availability.
   */
  auth_email_enabled: runtime('admin', 'global', 'public', 'boolean', 'true'),
  auth_sms_enabled: runtime('admin', 'global', 'public', 'boolean', 'false'),
  auth_telegram_enabled: runtime('admin', 'global', 'public', 'boolean', 'false'),
  auth_max_enabled: runtime('admin', 'global', 'public', 'boolean', 'false'),
  /** Legacy OAuth declarations; surface toggles are the effective admin controls. */
  auth_oauth_google_enabled: runtime('admin', 'global', 'public', 'boolean', 'false'),
  auth_oauth_yandex_enabled: runtime('admin', 'global', 'public', 'boolean', 'false'),
  auth_oauth_vk_enabled: runtime('admin', 'global', 'public', 'boolean', 'false'),
  auth_oauth_apple_enabled: runtime('admin', 'global', 'public', 'boolean', 'false'),
  auth_passkey_enabled: runtime('admin', 'global', 'public', 'boolean', 'true'),
  ...surfaceAuthSettingDefinitions,
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
    '{"version":1,"integrations":{"telegram":true,"max":true,"vk":false,"email":true,"smsc":true,"web_push":true,"google_calendar":true,"yandex_calendar":false}}',
  ),
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
  video_presign_ttl_seconds: runtime('admin', 'global', 'server', 'integer', '3600'),
  video_watermark_enabled: runtime('admin', 'global', 'server', 'boolean', 'false'),
  patient_booking_url: runtime('admin', 'per_org', 'authenticated_client', 'url', ''),
  /** Branded clinic root normally renders the public card; an organization may opt into /app. */
  clinic_root_skip_public_card: runtime('admin', 'per_org', 'server', 'boolean', 'false'),
  booking_default_organization_id: restricted('admin', 'global', 'uuid'),
  booking_calendar_show_working_hours: runtime(
    'admin',
    'per_org',
    'authenticated_client',
    'boolean',
    'false',
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
  booking_payment_providers: withSecretAudit(
    restricted(
      'admin',
      'per_org',
      'secret_envelope',
      'yookassa',
      'redacted',
      'booking_payment_public_config',
    ),
    auditDomainRedactor('booking_payment_providers'),
  ),
  saas_billing_payment_provider: withSecretAudit(
    restricted('admin', 'global', 'secret_envelope', 'yookassa', 'redacted'),
    auditDomainRedactor('saas_billing_payment_provider'),
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
  notifications_topics: runtime('admin', 'per_org', 'authenticated_client', 'structured', '[]'),
  smtp_outbound: withSecretAudit(
    restricted('admin', 'global', 'secret_envelope', 'absent', 'redacted'),
    auditObjectField('password'),
  ),
  /** Clinic-owned SMTP is used first for essential delivery and exclusively for clinic mailings. */
  clinic_smtp_outbound: withSecretAudit(
    restricted('admin', 'per_org', 'secret_envelope', 'absent', 'redacted'),
    auditObjectField('password'),
  ),
  /** Dedicated outbound SMSC credential. The platform credential remains an essential-delivery fallback. */
  clinic_smsc_api_key: restricted('admin', 'per_org', 'secret_envelope', 'absent', 'redacted'),
  /** Dedicated clinic bots are outbound credentials; inbound binding/webhook routing remains S6.5. */
  clinic_telegram_bot_token: restricted(
    'admin',
    'per_org',
    'secret_envelope',
    'absent',
    'redacted',
  ),
  clinic_max_bot_api_key: restricted('admin', 'per_org', 'secret_envelope', 'absent', 'redacted'),
  clinic_vk_community_access_token: restricted(
    'admin',
    'per_org',
    'secret_envelope',
    'absent',
    'redacted',
  ),
  operator_health_imap: withSecretAudit(
    restricted('admin', 'global', 'secret_envelope', 'absent', 'redacted'),
    auditObjectField('password'),
  ),
  web_push_vapid: withSecretAudit(
    restricted(
      'admin',
      'global',
      'secret_envelope',
      'absent',
      'redacted',
      'web_push_vapid_public_key',
    ),
    auditObjectField('privateKey'),
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
  // Public OAuth client identifier, not a credential — see the registry census comment above
  // `withSecretAudit` and `docs/_TODO/runs/INTEGRATION_SECRET_ENCRYPTION_DECISION_PACKET_2026-09-02.md`
  // §1.1. Left `secret_envelope`-labeled to avoid an unrelated relabel; only the audit policy differs.
  yandex_oauth_client_id: withSecretAudit(
    restricted('admin', 'global', 'secret_envelope', 'absent', 'derived', 'oauth_yandex_enabled'),
    AUDIT_NONE,
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
    'string_list',
    '[]',
    'derived',
    'oauth_yandex_enabled',
  ),
  // Public OAuth application id, not a credential — see the yandex_oauth_client_id comment above.
  vk_id_application_id: withSecretAudit(
    restricted('admin', 'global', 'secret_envelope', 'absent', 'derived', 'oauth_vk_enabled'),
    AUDIT_NONE,
  ),
  vk_id_client_secret: restricted(
    'admin',
    'global',
    'secret_envelope',
    'absent',
    'redacted',
    'oauth_vk_enabled',
  ),
  auth_altcha_hmac_secret: restricted('admin', 'global', 'secret_envelope', 'absent', 'redacted'),
  vk_id_redirect_uri: restricted('admin', 'global', 'url', 'absent', 'derived', 'oauth_vk_enabled'),
  // Public OAuth client identifier, not a credential — see the yandex_oauth_client_id comment above.
  google_client_id: withSecretAudit(restricted('admin', 'global', 'secret_envelope'), AUDIT_NONE),
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
  // Public Apple OAuth identifiers, not credentials — see the yandex_oauth_client_id comment above.
  apple_oauth_client_id: withSecretAudit(
    restricted('admin', 'global', 'secret_envelope', 'absent', 'derived', 'oauth_apple_enabled'),
    AUDIT_NONE,
  ),
  apple_oauth_team_id: withSecretAudit(
    restricted('admin', 'global', 'secret_envelope', 'absent', 'derived', 'oauth_apple_enabled'),
    AUDIT_NONE,
  ),
  apple_oauth_key_id: withSecretAudit(
    restricted('admin', 'global', 'secret_envelope', 'absent', 'derived', 'oauth_apple_enabled'),
    AUDIT_NONE,
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
  /** Clinic personal domain hostname intent; part of branding/custom_domain capability (owner 05.08). */
  org_custom_domain_hostname: runtime('admin', 'per_org', 'authenticated_client', 'string', ''),
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
