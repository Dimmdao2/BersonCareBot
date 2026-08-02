import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { normalizeTestAccountIdentifiersValue } from '@/modules/system-settings/testAccounts';
import {
  VIDEO_PRESIGN_TTL_MAX_SEC,
  VIDEO_PRESIGN_TTL_MIN_SEC,
} from '@/modules/media/videoPresignTtlConstants';
import type { IntegratorLinkedPhoneSource } from './AdminSettingsSection';
import type { VideoDefaultDeliveryUi } from './VideoSystemSettingsSection';
import type { EmailSmtpSectionProps } from './EmailSmtpSection';
import type { AuthProvidersSectionProps } from './AuthProvidersSection';
import {
  HEALTH_FAILURE_ARCHIVE_INTEGRATOR_OUTBOX_PROBE,
  HEALTH_FAILURE_ARCHIVE_OUTGOING_PROBE,
  HEALTH_FAILURE_ARCHIVE_OUTGOING_REMINDER_PROBE,
  HEALTH_FAILURE_ARCHIVE_PROJECTION_PROBE,
  type HealthFailureArchiveProbe,
} from '@/modules/operator-health/healthFailureArchiveConstants';
import { parseNotificationsTopics } from '@/modules/patient-notifications/notificationsTopics';
import { redactAdminSettingsForClient } from '@/modules/system-settings/webPushVapidRuntime';
import type { NotificationTopicRow } from '@/modules/patient-notifications/notificationsTopics';
import {
  mergeOperatorHealthAlertConfigFromLegacy,
  type OperatorHealthAlertConfig,
} from '@/modules/operator-alerts/operatorHealthAlertConfig';
import {
  parseOperatorHealthProjectionThresholds,
  type OperatorHealthProjectionThresholds,
} from '@/modules/operator-health/operatorHealthProjectionThresholds';
import { parseOperatorAlertFallbackEmailSetting } from '@/modules/operator-alerts/operatorAlertFallbackEmail';
import { RuntimeSettingUnavailableError } from '@/modules/system-settings/runtimeSettingUnavailable';

export const ADMIN_TAB_REDIRECTS: Record<string, string> = {
  'system-health': '/app/admin/system-health',
  'health-archive': '/app/admin/health-archive',
  'audit-log': '/app/admin/audit-log',
  'product-analytics': '/app/doctor/analytics?tab=app',
  'reminder-stats': '/app/doctor/analytics?tab=notifications',
  // PLAT-01…09 slice 4 (2026-07-26) moved admin/* pages to /app/platform/admin/*; owner ruling
  // 2026-07-26 (final home) renamed the whole tree to /app/admin/* and flattened the nested
  // admin/* subtree one level (no /app/admin/admin/*).
  'app-params': '/app/admin/app-settings',
  auth: '/app/admin/auth',
  integrations: '/app/admin/integrations',
  catalog: '/app/admin/booking',
  diagnostics: '/app/admin/technical',
};

const ADMIN_SETTINGS_PAGE_REQUIRED_KEYS = [
  'error_tracking_dsn', 'error_tracking_enabled', 'dev_mode', 'debug_forward_to_admin',
  'max_debug_page_enabled', 'important_fallback_delay_minutes', 'platform_user_merge_v2_enabled',
  'integrator_linked_phone_source', 'test_account_identifiers', 'patient_app_maintenance_enabled',
  'patient_app_maintenance_message', 'patient_program_discussion_doctor_reply_from_log_enabled',
  'patient_program_discussion_ui_enabled', 'patient_program_discussion_media_submission_enabled',
  'patient_booking_url', 'operator_health_alert_config', 'admin_incident_alert_config',
  'operator_alert_fallback_email', 'operator_health_projection_thresholds',
  'video_playback_api_enabled', 'video_default_delivery', 'video_hls_pipeline_enabled',
  'video_hls_new_uploads_auto_transcode', 'video_hls_reconcile_enabled', 'video_watermark_enabled',
  'video_presign_ttl_seconds', 'support_contact_url', 'app_display_timezone',
  'telegram_login_bot_username', 'max_login_bot_nickname', 'max_bot_api_key', 'vk_web_login_url',
  'vk_id_application_id', 'vk_id_client_secret', 'vk_id_redirect_uri', 'yandex_oauth_client_id',
  'yandex_oauth_client_secret', 'yandex_oauth_redirect_uri', 'google_client_id',
  'google_client_secret', 'google_oauth_login_redirect_uri', 'google_redirect_uri',
  'apple_oauth_client_id', 'apple_oauth_team_id', 'apple_oauth_key_id', 'apple_oauth_private_key',
  'apple_oauth_redirect_uri', 'google_refresh_token', 'google_calendar_id',
  'google_calendar_enabled', 'google_connected_email', 'notifications_topics', 'smtp_outbound',
  'web_push_vapid',
] as const;

function getValueJson<T>(valueJson: unknown, fallback: T): T {
  if (
    valueJson !== null &&
    typeof valueJson === 'object' &&
    'value' in (valueJson as Record<string, unknown>)
  ) {
    return (valueJson as Record<string, unknown>).value as T;
  }
  return fallback;
}

function buildAuthProvidersConfig(
  adminSettingsList: Array<{ key: string; valueJson: unknown }>,
): AuthProvidersSectionProps {
  function adminStr(key: string): string {
    const raw = getValueJson(adminSettingsList.find((x) => x.key === key)?.valueJson, '');
    return typeof raw === 'string' ? raw.trim() : '';
  }

  return {
    telegramLoginBotUsername: adminStr('telegram_login_bot_username'),
    maxLoginBotNickname: adminStr('max_login_bot_nickname'),
    maxBotApiKey: adminStr('max_bot_api_key'),
    vkWebLoginUrl: adminStr('vk_web_login_url'),
    vkIdApplicationId: adminStr('vk_id_application_id'),
    vkIdHasStoredClientSecret: (() => {
      const raw = getValueJson<unknown>(
        adminSettingsList.find((x) => x.key === 'vk_id_client_secret')?.valueJson,
        null,
      );
      return (
        raw !== null &&
        typeof raw === 'object' &&
        (raw as Record<string, unknown>).hasStoredSecret === true
      );
    })(),
    vkIdRedirectUri: adminStr('vk_id_redirect_uri'),
    yandexOauthClientId: adminStr('yandex_oauth_client_id'),
    yandexOauthClientSecret: adminStr('yandex_oauth_client_secret'),
    yandexOauthRedirectUri: adminStr('yandex_oauth_redirect_uri'),
    googleClientId: adminStr('google_client_id'),
    googleClientSecret: adminStr('google_client_secret'),
    googleOauthLoginRedirectUri: adminStr('google_oauth_login_redirect_uri'),
    googleCalendarRedirectUri: adminStr('google_redirect_uri'),
    appleOauthClientId: adminStr('apple_oauth_client_id'),
    appleOauthTeamId: adminStr('apple_oauth_team_id'),
    appleOauthKeyId: adminStr('apple_oauth_key_id'),
    appleOauthPrivateKey: adminStr('apple_oauth_private_key'),
    appleOauthRedirectUri: adminStr('apple_oauth_redirect_uri'),
  };
}

/** The auth page reads only its own settings; unrelated technical rows must not take it down. */
export async function loadAuthProvidersConfig(): Promise<AuthProvidersSectionProps> {
  const rawAdminSettingsList = await buildAppDeps().systemSettings.listSettingsByScope('admin');
  return buildAuthProvidersConfig(redactAdminSettingsForClient(rawAdminSettingsList));
}

function parseVideoBoolSetting(valueJson: unknown): boolean {
  const raw = getValueJson<unknown>(valueJson, false);
  return raw === true || raw === 'true';
}

function parseVideoDefaultDeliverySetting(valueJson: unknown): VideoDefaultDeliveryUi {
  const raw = getValueJson<unknown>(valueJson, 'auto');
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (s === 'mp4' || s === 'hls' || s === 'auto') return s;
  return 'auto';
}

function parseVideoPresignTtlSeconds(valueJson: unknown): number {
  const raw = getValueJson<unknown>(valueJson, 3600);
  const n =
    typeof raw === 'number' && Number.isFinite(raw)
      ? raw
      : typeof raw === 'string' && /^\d+$/.test(raw.trim())
        ? Number.parseInt(raw.trim(), 10)
        : 3600;
  return Math.min(VIDEO_PRESIGN_TTL_MAX_SEC, Math.max(VIDEO_PRESIGN_TTL_MIN_SEC, Math.round(n)));
}

function parseAdminSmtpOutboundForUi(
  settings: Array<{ key: string; valueJson: unknown }>,
): EmailSmtpSectionProps {
  const row = settings.find((x) => x.key === 'smtp_outbound');
  const inner = row ? getValueJson<unknown>(row.valueJson, null) : null;
  let host = '';
  let port = 587;
  let secure = false;
  let user = '';
  let from = '';
  let hasStoredPassword = false;
  if (inner !== null && typeof inner === 'object' && !Array.isArray(inner)) {
    const o = inner as Record<string, unknown>;
    host = typeof o.host === 'string' ? o.host.trim() : '';
    if (typeof o.port === 'number' && Number.isFinite(o.port)) {
      port = Math.min(65535, Math.max(1, Math.round(o.port)));
    } else if (typeof o.port === 'string' && /^\d+$/.test(o.port.trim())) {
      const n = Number.parseInt(o.port.trim(), 10);
      if (Number.isFinite(n)) port = Math.min(65535, Math.max(1, n));
    }
    secure = o.secure === true || o.secure === 1 || o.secure === 'true' || o.secure === '1';
    user = typeof o.user === 'string' ? o.user.trim() : '';
    from = typeof o.from === 'string' ? o.from.trim() : '';
    const p = typeof o.password === 'string' ? o.password : '';
    hasStoredPassword = p.trim().length > 0;
  }
  return { host, port, secure, user, from, hasStoredPassword };
}

export function parseHealthArchiveProbeParam(
  raw: string | string[] | undefined,
): HealthFailureArchiveProbe | undefined {
  const s =
    typeof raw === 'string'
      ? raw.trim()
      : Array.isArray(raw) && typeof raw[0] === 'string'
        ? raw[0].trim()
        : '';
  if (!s) return undefined;
  if (
    s === HEALTH_FAILURE_ARCHIVE_OUTGOING_PROBE ||
    s === HEALTH_FAILURE_ARCHIVE_INTEGRATOR_OUTBOX_PROBE ||
    s === HEALTH_FAILURE_ARCHIVE_PROJECTION_PROBE ||
    s === HEALTH_FAILURE_ARCHIVE_OUTGOING_REMINDER_PROBE
  ) {
    return s;
  }
  return undefined;
}

export type AdminDiagnosticsSettings = {
  devMode: boolean;
  debugForwardToAdmin: boolean;
  miniappAuthVerboseServerLog: boolean;
  importantFallbackDelayMinutes: number;
  platformUserMergeV2Enabled: boolean;
  integratorLinkedPhoneSource: IntegratorLinkedPhoneSource;
  testAccountIdentifiers: {
    phones: string[];
    telegramIds: string[];
    maxIds: string[];
    emails: string[];
  };
  patientAppMaintenanceEnabled: boolean;
  patientAppMaintenanceMessage: string;
  patientProgramDiscussionDoctorReplyFromLogEnabled: boolean;
  patientProgramDiscussionUiEnabled: boolean;
  patientProgramDiscussionMediaSubmissionEnabled: boolean;
  patientBookingUrl: string;
  operatorHealthAlertsConfig: OperatorHealthAlertConfig;
  operatorAlertFallbackEmail: string;
  operatorHealthProjectionThresholds: OperatorHealthProjectionThresholds;
};

export type AdminSettingsPageData = {
  adminSettingsList: Array<{ key: string; valueJson: unknown }>;
  diagnostics: AdminDiagnosticsSettings;
  videoSystemSettingsProps: {
    initialPlaybackApiEnabled: boolean;
    initialDefaultDelivery: VideoDefaultDeliveryUi;
    initialHlsPipelineEnabled: boolean;
    initialNewUploadsAutoTranscode: boolean;
    initialHlsReconcileEnabled: boolean;
    initialWatermarkEnabled: boolean;
    initialPresignTtlSeconds: number;
  };
  appParametersConfig: {
    supportContactUrl: string;
    appDisplayTimezone: string;
  };
  authProvidersConfig: AuthProvidersSectionProps;
  googleCalendarConfig: {
    googleClientId: string;
    googleClientSecret: string;
    googleRedirectUri: string;
    googleRefreshToken: string;
    googleCalendarId: string;
    googleCalendarEnabled: boolean;
    googleConnectedEmail: string;
  };
  notificationsTopicsRows: NotificationTopicRow[];
  smtpOutboundUi: EmailSmtpSectionProps;
  webPushVapidUi: { publicKey: string; hasStoredPrivateKey: boolean };
  errorTracking: { enabled: boolean; hasStoredDsn: boolean };
};

export async function loadAdminSettingsPageData(): Promise<AdminSettingsPageData> {
  const deps = buildAppDeps();
  const rawAdminSettingsList = await deps.systemSettings.listSettingsByScope('admin');
  const availableAdminSettingKeys = new Set(rawAdminSettingsList.map((setting) => setting.key));
  const missingKey = ADMIN_SETTINGS_PAGE_REQUIRED_KEYS.find(
    (key) => !availableAdminSettingKeys.has(key),
  );
  if (missingKey) {
    throw new RuntimeSettingUnavailableError(missingKey);
  }
  const errorTrackingDsn = getValueJson(
    rawAdminSettingsList.find((x) => x.key === 'error_tracking_dsn')?.valueJson,
    '',
  );
  const errorTracking = {
    enabled:
      getValueJson<unknown>(
        rawAdminSettingsList.find((x) => x.key === 'error_tracking_enabled')?.valueJson,
        false,
      ) === true,
    hasStoredDsn: typeof errorTrackingDsn === 'string' && errorTrackingDsn.trim().length > 0,
  };
  const adminSettingsList = redactAdminSettingsForClient(rawAdminSettingsList);

  function adminStr(key: string): string {
    const raw = getValueJson(adminSettingsList.find((x) => x.key === key)?.valueJson, '');
    return typeof raw === 'string' ? raw.trim() : '';
  }

  const diagnostics: AdminDiagnosticsSettings = {
    devMode: Boolean(
      getValueJson(adminSettingsList.find((x) => x.key === 'dev_mode')?.valueJson, false),
    ),
    debugForwardToAdmin: Boolean(
      getValueJson(
        adminSettingsList.find((x) => x.key === 'debug_forward_to_admin')?.valueJson,
        false,
      ),
    ),
    miniappAuthVerboseServerLog: Boolean(
      getValueJson(
        adminSettingsList.find((x) => x.key === 'max_debug_page_enabled')?.valueJson,
        false,
      ),
    ),
    importantFallbackDelayMinutes: Number(
      getValueJson(
        adminSettingsList.find((x) => x.key === 'important_fallback_delay_minutes')?.valueJson,
        60,
      ),
    ),
    platformUserMergeV2Enabled: (() => {
      const raw = getValueJson<unknown>(
        adminSettingsList.find((x) => x.key === 'platform_user_merge_v2_enabled')?.valueJson,
        false,
      );
      return raw === true || raw === 'true';
    })(),
    integratorLinkedPhoneSource: ((): IntegratorLinkedPhoneSource => {
      const raw = getValueJson<unknown>(
        adminSettingsList.find((x) => x.key === 'integrator_linked_phone_source')?.valueJson,
        'public_then_contacts',
      );
      const s = typeof raw === 'string' ? raw.trim() : '';
      if (s === 'public_only' || s === 'contacts_only' || s === 'public_then_contacts') return s;
      return 'public_then_contacts';
    })(),
    testAccountIdentifiers: (() => {
      const inner = getValueJson<unknown>(
        adminSettingsList.find((x) => x.key === 'test_account_identifiers')?.valueJson,
        null,
      );
      return (
        normalizeTestAccountIdentifiersValue(inner) ?? {
          phones: [] as string[],
          telegramIds: [] as string[],
          maxIds: [] as string[],
          emails: [] as string[],
        }
      );
    })(),
    patientAppMaintenanceEnabled: (() => {
      const raw = getValueJson<unknown>(
        adminSettingsList.find((x) => x.key === 'patient_app_maintenance_enabled')?.valueJson,
        false,
      );
      return raw === true || raw === 'true';
    })(),
    patientAppMaintenanceMessage: (() => {
      const raw = getValueJson(
        adminSettingsList.find((x) => x.key === 'patient_app_maintenance_message')?.valueJson,
        '',
      );
      const s = typeof raw === 'string' ? raw.trim() : '';
      return s;
    })(),
    patientProgramDiscussionDoctorReplyFromLogEnabled: (() => {
      const raw = getValueJson<unknown>(
        adminSettingsList.find(
          (x) => x.key === 'patient_program_discussion_doctor_reply_from_log_enabled',
        )?.valueJson,
        false,
      );
      return raw === true || raw === 'true';
    })(),
    patientProgramDiscussionUiEnabled: (() => {
      const raw = getValueJson<unknown>(
        adminSettingsList.find((x) => x.key === 'patient_program_discussion_ui_enabled')?.valueJson,
        false,
      );
      return raw === true || raw === 'true';
    })(),
    patientProgramDiscussionMediaSubmissionEnabled: (() => {
      const raw = getValueJson<unknown>(
        adminSettingsList.find(
          (x) => x.key === 'patient_program_discussion_media_submission_enabled',
        )?.valueJson,
        false,
      );
      return raw === true || raw === 'true';
    })(),
    patientBookingUrl: (() => {
      const raw = getValueJson(
        adminSettingsList.find((x) => x.key === 'patient_booking_url')?.valueJson,
        '',
      );
      const s = typeof raw === 'string' ? raw.trim() : '';
      return s;
    })(),
    operatorHealthAlertsConfig: mergeOperatorHealthAlertConfigFromLegacy(
      adminSettingsList.find((x) => x.key === 'operator_health_alert_config')?.valueJson ?? null,
      adminSettingsList.find((x) => x.key === 'admin_incident_alert_config')?.valueJson ?? null,
    ),
    operatorAlertFallbackEmail:
      parseOperatorAlertFallbackEmailSetting(
        adminSettingsList.find((x) => x.key === 'operator_alert_fallback_email')?.valueJson ?? null,
      ) ?? '',
    operatorHealthProjectionThresholds: parseOperatorHealthProjectionThresholds(
      adminSettingsList.find((x) => x.key === 'operator_health_projection_thresholds')?.valueJson ??
        null,
    ),
  };

  return {
    adminSettingsList,
    diagnostics,
    videoSystemSettingsProps: {
      initialPlaybackApiEnabled: parseVideoBoolSetting(
        adminSettingsList.find((x) => x.key === 'video_playback_api_enabled')?.valueJson,
      ),
      initialDefaultDelivery: parseVideoDefaultDeliverySetting(
        adminSettingsList.find((x) => x.key === 'video_default_delivery')?.valueJson,
      ),
      initialHlsPipelineEnabled: parseVideoBoolSetting(
        adminSettingsList.find((x) => x.key === 'video_hls_pipeline_enabled')?.valueJson,
      ),
      initialNewUploadsAutoTranscode: parseVideoBoolSetting(
        adminSettingsList.find((x) => x.key === 'video_hls_new_uploads_auto_transcode')?.valueJson,
      ),
      initialHlsReconcileEnabled: parseVideoBoolSetting(
        adminSettingsList.find((x) => x.key === 'video_hls_reconcile_enabled')?.valueJson,
      ),
      initialWatermarkEnabled: parseVideoBoolSetting(
        adminSettingsList.find((x) => x.key === 'video_watermark_enabled')?.valueJson,
      ),
      initialPresignTtlSeconds: parseVideoPresignTtlSeconds(
        adminSettingsList.find((x) => x.key === 'video_presign_ttl_seconds')?.valueJson,
      ),
    },
    appParametersConfig: {
      supportContactUrl: (() => {
        const raw = getValueJson(
          adminSettingsList.find((x) => x.key === 'support_contact_url')?.valueJson,
          '',
        );
        return typeof raw === 'string' ? raw.trim() : '';
      })(),
      appDisplayTimezone: (() => {
        const raw = getValueJson(
          adminSettingsList.find((x) => x.key === 'app_display_timezone')?.valueJson,
          '',
        );
        return typeof raw === 'string' ? raw.trim() : '';
      })(),
    },
    authProvidersConfig: buildAuthProvidersConfig(adminSettingsList),
    googleCalendarConfig: {
      googleClientId: adminStr('google_client_id'),
      googleClientSecret: adminStr('google_client_secret'),
      googleRedirectUri: adminStr('google_redirect_uri'),
      googleRefreshToken: adminStr('google_refresh_token'),
      googleCalendarId: adminStr('google_calendar_id'),
      googleCalendarEnabled: (() => {
        const raw = getValueJson<unknown>(
          adminSettingsList.find((x) => x.key === 'google_calendar_enabled')?.valueJson,
          false,
        );
        return raw === true || raw === 'true';
      })(),
      googleConnectedEmail: adminStr('google_connected_email'),
    },
    notificationsTopicsRows: parseNotificationsTopics(
      adminSettingsList.find((x) => x.key === 'notifications_topics')?.valueJson ?? null,
    ),
    smtpOutboundUi: parseAdminSmtpOutboundForUi(adminSettingsList),
    webPushVapidUi: (() => {
      const row = adminSettingsList.find((x) => x.key === 'web_push_vapid');
      const inner = row ? getValueJson<unknown>(row.valueJson, null) : null;
      let publicKey = '';
      let hasStoredPrivateKey = false;
      if (inner !== null && typeof inner === 'object' && !Array.isArray(inner)) {
        const o = inner as Record<string, unknown>;
        publicKey = typeof o.publicKey === 'string' ? o.publicKey.trim() : '';
        if (typeof o.hasPrivateKey === 'boolean') {
          hasStoredPrivateKey = o.hasPrivateKey;
        } else {
          const pk = typeof o.privateKey === 'string' ? o.privateKey.trim() : '';
          hasStoredPrivateKey = pk.length > 0;
        }
      }
      return { publicKey, hasStoredPrivateKey };
    })(),
    errorTracking,
  };
}
