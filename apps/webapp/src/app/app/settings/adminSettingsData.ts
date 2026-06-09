import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { env } from "@/config/env";
import { DEFAULT_APP_DISPLAY_TIMEZONE } from "@/modules/system-settings/appDisplayTimezone";
import { DEFAULT_SUPPORT_CONTACT_URL } from "@/modules/system-settings/supportContactConstants";
import {
  DEFAULT_PATIENT_BOOKING_URL,
  DEFAULT_PATIENT_MAINTENANCE_MESSAGE,
} from "@/modules/system-settings/patientMaintenance";
import { parseIdTokens } from "@/shared/parsers/parseIdTokens";
import { normalizeTestAccountIdentifiersValue } from "@/modules/system-settings/testAccounts";
import {
  VIDEO_PRESIGN_TTL_MAX_SEC,
  VIDEO_PRESIGN_TTL_MIN_SEC,
} from "@/modules/media/videoPresignTtlConstants";
import type { IntegratorLinkedPhoneSource } from "./AdminSettingsSection";
import type { VideoDefaultDeliveryUi } from "./VideoSystemSettingsSection";
import type { EmailSmtpSectionProps } from "./EmailSmtpSection";
import {
  HEALTH_FAILURE_ARCHIVE_INTEGRATOR_OUTBOX_PROBE,
  HEALTH_FAILURE_ARCHIVE_OUTGOING_PROBE,
  HEALTH_FAILURE_ARCHIVE_OUTGOING_REMINDER_PROBE,
  HEALTH_FAILURE_ARCHIVE_PROJECTION_PROBE,
  type HealthFailureArchiveProbe,
} from "@/modules/operator-health/healthFailureArchiveConstants";
import { parseNotificationsTopics } from "@/modules/patient-notifications/notificationsTopics";
import { redactAdminSettingsForClient } from "@/modules/system-settings/webPushVapidRuntime";
import type { NotificationTopicRow } from "@/modules/patient-notifications/notificationsTopics";
import {
  mergeOperatorHealthAlertConfigFromLegacy,
  type OperatorHealthAlertConfig,
} from "@/modules/operator-alerts/operatorHealthAlertConfig";

export const ADMIN_TAB_REDIRECTS: Record<string, string> = {
  "system-health": "/app/doctor/system-health",
  "health-archive": "/app/doctor/health-archive",
  "audit-log": "/app/doctor/audit-log",
  "product-analytics": "/app/doctor/usage",
  "reminder-stats": "/app/doctor/analytics/notifications",
  "app-params": "/app/doctor/admin/app-settings",
  auth: "/app/doctor/admin/auth",
  integrations: "/app/doctor/admin/integrations",
  catalog: "/app/doctor/admin/booking",
  diagnostics: "/app/doctor/admin/technical",
};

function getValueJson<T>(valueJson: unknown, fallback: T): T {
  if (valueJson !== null && typeof valueJson === "object" && "value" in (valueJson as Record<string, unknown>)) {
    return (valueJson as Record<string, unknown>).value as T;
  }
  return fallback;
}

function firstAdminSlotFromSettings(settings: Array<{ key: string; valueJson: unknown }>, key: string): string {
  const entry = settings.find((x) => x.key === key);
  const raw = getValueJson<unknown>(entry?.valueJson, []);
  if (Array.isArray(raw)) {
    const s = raw.find((x) => typeof x === "string" && String(x).trim().length > 0);
    return typeof s === "string" ? s.trim() : "";
  }
  return parseIdTokens(raw)[0] ?? "";
}

function parseVideoBoolSetting(valueJson: unknown): boolean {
  const raw = getValueJson<unknown>(valueJson, false);
  return raw === true || raw === "true";
}

function parseVideoDefaultDeliverySetting(valueJson: unknown): VideoDefaultDeliveryUi {
  const raw = getValueJson<unknown>(valueJson, "auto");
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "mp4" || s === "hls" || s === "auto") return s;
  return "auto";
}

function parseVideoPresignTtlSeconds(valueJson: unknown): number {
  const raw = getValueJson<unknown>(valueJson, 3600);
  const n =
    typeof raw === "number" && Number.isFinite(raw)
      ? raw
      : typeof raw === "string" && /^\d+$/.test(raw.trim())
        ? Number.parseInt(raw.trim(), 10)
        : 3600;
  return Math.min(VIDEO_PRESIGN_TTL_MAX_SEC, Math.max(VIDEO_PRESIGN_TTL_MIN_SEC, Math.round(n)));
}

function parseAdminSmtpOutboundForUi(settings: Array<{ key: string; valueJson: unknown }>): EmailSmtpSectionProps {
  const row = settings.find((x) => x.key === "smtp_outbound");
  const inner = row ? getValueJson<unknown>(row.valueJson, null) : null;
  let host = "";
  let port = 587;
  let secure = false;
  let user = "";
  let from = "";
  let hasStoredPassword = false;
  if (inner !== null && typeof inner === "object" && !Array.isArray(inner)) {
    const o = inner as Record<string, unknown>;
    host = typeof o.host === "string" ? o.host.trim() : "";
    if (typeof o.port === "number" && Number.isFinite(o.port)) {
      port = Math.min(65535, Math.max(1, Math.round(o.port)));
    } else if (typeof o.port === "string" && /^\d+$/.test(o.port.trim())) {
      const n = Number.parseInt(o.port.trim(), 10);
      if (Number.isFinite(n)) port = Math.min(65535, Math.max(1, n));
    }
    secure = o.secure === true || o.secure === 1 || o.secure === "true" || o.secure === "1";
    user = typeof o.user === "string" ? o.user.trim() : "";
    from = typeof o.from === "string" ? o.from.trim() : "";
    const p = typeof o.password === "string" ? o.password : "";
    hasStoredPassword = p.trim().length > 0;
  }
  return { host, port, secure, user, from, hasStoredPassword };
}

export function parseHealthArchiveProbeParam(
  raw: string | string[] | undefined,
): HealthFailureArchiveProbe | undefined {
  const s =
    typeof raw === "string"
      ? raw.trim()
      : Array.isArray(raw) && typeof raw[0] === "string"
        ? raw[0].trim()
        : "";
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
  adminPhone: string;
  adminTelegramId: string;
  adminMaxId: string;
  testAccountIdentifiers: { phones: string[]; telegramIds: string[]; maxIds: string[] };
  patientAppMaintenanceEnabled: boolean;
  patientAppMaintenanceMessage: string;
  patientProgramDiscussionDoctorReplyFromLogEnabled: boolean;
  patientProgramDiscussionUiEnabled: boolean;
  patientProgramDiscussionMediaSubmissionEnabled: boolean;
  patientBookingUrl: string;
  operatorHealthAlertsConfig: OperatorHealthAlertConfig;
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
    appBaseUrl: string;
    supportContactUrl: string;
    appDisplayTimezone: string;
  };
  authProvidersConfig: {
    telegramLoginBotUsername: string;
    maxLoginBotNickname: string;
    maxBotApiKey: string;
    vkWebLoginUrl: string;
    yandexOauthClientId: string;
    yandexOauthClientSecret: string;
    yandexOauthRedirectUri: string;
    googleClientId: string;
    googleClientSecret: string;
    googleOauthLoginRedirectUri: string;
    appleOauthClientId: string;
    appleOauthTeamId: string;
    appleOauthKeyId: string;
    appleOauthPrivateKey: string;
    appleOauthRedirectUri: string;
  };
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
};

export async function loadAdminSettingsPageData(): Promise<AdminSettingsPageData> {
  const deps = buildAppDeps();
  const adminSettingsList = redactAdminSettingsForClient(await deps.systemSettings.listSettingsByScope("admin"));

  function adminStr(key: string): string {
    const raw = getValueJson(adminSettingsList.find((x) => x.key === key)?.valueJson, "");
    return typeof raw === "string" ? raw.trim() : "";
  }

  const diagnostics: AdminDiagnosticsSettings = {
    devMode: Boolean(getValueJson(adminSettingsList.find((x) => x.key === "dev_mode")?.valueJson, false)),
    debugForwardToAdmin: Boolean(
      getValueJson(adminSettingsList.find((x) => x.key === "debug_forward_to_admin")?.valueJson, false),
    ),
    miniappAuthVerboseServerLog: Boolean(
      getValueJson(adminSettingsList.find((x) => x.key === "max_debug_page_enabled")?.valueJson, false),
    ),
    importantFallbackDelayMinutes: Number(
      getValueJson(adminSettingsList.find((x) => x.key === "important_fallback_delay_minutes")?.valueJson, 60),
    ),
    platformUserMergeV2Enabled: (() => {
      const raw = getValueJson<unknown>(
        adminSettingsList.find((x) => x.key === "platform_user_merge_v2_enabled")?.valueJson,
        false,
      );
      return raw === true || raw === "true";
    })(),
    integratorLinkedPhoneSource: ((): IntegratorLinkedPhoneSource => {
      const raw = getValueJson<unknown>(
        adminSettingsList.find((x) => x.key === "integrator_linked_phone_source")?.valueJson,
        "public_then_contacts",
      );
      const s = typeof raw === "string" ? raw.trim() : "";
      if (s === "public_only" || s === "contacts_only" || s === "public_then_contacts") return s;
      return "public_then_contacts";
    })(),
    adminPhone: firstAdminSlotFromSettings(adminSettingsList, "admin_phones"),
    adminTelegramId: firstAdminSlotFromSettings(adminSettingsList, "admin_telegram_ids"),
    adminMaxId: firstAdminSlotFromSettings(adminSettingsList, "admin_max_ids"),
    testAccountIdentifiers: (() => {
      const inner = getValueJson<unknown>(
        adminSettingsList.find((x) => x.key === "test_account_identifiers")?.valueJson,
        null,
      );
      return (
        normalizeTestAccountIdentifiersValue(inner) ?? {
          phones: [] as string[],
          telegramIds: [] as string[],
          maxIds: [] as string[],
        }
      );
    })(),
    patientAppMaintenanceEnabled: (() => {
      const raw = getValueJson<unknown>(
        adminSettingsList.find((x) => x.key === "patient_app_maintenance_enabled")?.valueJson,
        false,
      );
      return raw === true || raw === "true";
    })(),
    patientAppMaintenanceMessage: (() => {
      const raw = getValueJson(adminSettingsList.find((x) => x.key === "patient_app_maintenance_message")?.valueJson, "");
      const s = typeof raw === "string" ? raw.trim() : "";
      return s.length > 0 ? s : DEFAULT_PATIENT_MAINTENANCE_MESSAGE;
    })(),
    patientProgramDiscussionDoctorReplyFromLogEnabled: (() => {
      const raw = getValueJson<unknown>(
        adminSettingsList.find((x) => x.key === "patient_program_discussion_doctor_reply_from_log_enabled")?.valueJson,
        false,
      );
      return raw === true || raw === "true";
    })(),
    patientProgramDiscussionUiEnabled: (() => {
      const raw = getValueJson<unknown>(
        adminSettingsList.find((x) => x.key === "patient_program_discussion_ui_enabled")?.valueJson,
        false,
      );
      return raw === true || raw === "true";
    })(),
    patientProgramDiscussionMediaSubmissionEnabled: (() => {
      const raw = getValueJson<unknown>(
        adminSettingsList.find((x) => x.key === "patient_program_discussion_media_submission_enabled")?.valueJson,
        false,
      );
      return raw === true || raw === "true";
    })(),
    patientBookingUrl: (() => {
      const raw = getValueJson(adminSettingsList.find((x) => x.key === "patient_booking_url")?.valueJson, "");
      const s = typeof raw === "string" ? raw.trim() : "";
      return s.length > 0 ? s : DEFAULT_PATIENT_BOOKING_URL;
    })(),
    operatorHealthAlertsConfig: mergeOperatorHealthAlertConfigFromLegacy(
      adminSettingsList.find((x) => x.key === "operator_health_alert_config")?.valueJson ?? null,
      adminSettingsList.find((x) => x.key === "admin_incident_alert_config")?.valueJson ?? null,
    ),
  };

  return {
    adminSettingsList,
    diagnostics,
    videoSystemSettingsProps: {
      initialPlaybackApiEnabled: parseVideoBoolSetting(
        adminSettingsList.find((x) => x.key === "video_playback_api_enabled")?.valueJson,
      ),
      initialDefaultDelivery: parseVideoDefaultDeliverySetting(
        adminSettingsList.find((x) => x.key === "video_default_delivery")?.valueJson,
      ),
      initialHlsPipelineEnabled: parseVideoBoolSetting(
        adminSettingsList.find((x) => x.key === "video_hls_pipeline_enabled")?.valueJson,
      ),
      initialNewUploadsAutoTranscode: parseVideoBoolSetting(
        adminSettingsList.find((x) => x.key === "video_hls_new_uploads_auto_transcode")?.valueJson,
      ),
      initialHlsReconcileEnabled: parseVideoBoolSetting(
        adminSettingsList.find((x) => x.key === "video_hls_reconcile_enabled")?.valueJson,
      ),
      initialWatermarkEnabled: parseVideoBoolSetting(
        adminSettingsList.find((x) => x.key === "video_watermark_enabled")?.valueJson,
      ),
      initialPresignTtlSeconds: parseVideoPresignTtlSeconds(
        adminSettingsList.find((x) => x.key === "video_presign_ttl_seconds")?.valueJson,
      ),
    },
    appParametersConfig: {
      appBaseUrl: (() => {
        const raw = getValueJson(adminSettingsList.find((x) => x.key === "app_base_url")?.valueJson, "");
        const s = typeof raw === "string" ? raw.trim() : "";
        return s.length > 0 ? s : env.APP_BASE_URL.replace(/\/$/, "");
      })(),
      supportContactUrl: (() => {
        const raw = getValueJson(adminSettingsList.find((x) => x.key === "support_contact_url")?.valueJson, "");
        const s = typeof raw === "string" ? raw.trim() : "";
        return s.length > 0 ? s : DEFAULT_SUPPORT_CONTACT_URL;
      })(),
      appDisplayTimezone: (() => {
        const raw = getValueJson(adminSettingsList.find((x) => x.key === "app_display_timezone")?.valueJson, "");
        const s = typeof raw === "string" ? raw.trim() : "";
        return s.length > 0 ? s : DEFAULT_APP_DISPLAY_TIMEZONE;
      })(),
    },
    authProvidersConfig: {
      telegramLoginBotUsername: (() => {
        const raw = getValueJson(
          adminSettingsList.find((x) => x.key === "telegram_login_bot_username")?.valueJson,
          "",
        );
        return typeof raw === "string" ? raw.trim() : "";
      })(),
      maxLoginBotNickname: (() => {
        const raw = getValueJson(
          adminSettingsList.find((x) => x.key === "max_login_bot_nickname")?.valueJson,
          "",
        );
        return typeof raw === "string" ? raw.trim() : "";
      })(),
      maxBotApiKey: (() => {
        const raw = getValueJson(adminSettingsList.find((x) => x.key === "max_bot_api_key")?.valueJson, "");
        return typeof raw === "string" ? raw.trim() : "";
      })(),
      vkWebLoginUrl: (() => {
        const raw = getValueJson(adminSettingsList.find((x) => x.key === "vk_web_login_url")?.valueJson, "");
        return typeof raw === "string" ? raw.trim() : "";
      })(),
      yandexOauthClientId: (() => {
        const raw = getValueJson(adminSettingsList.find((x) => x.key === "yandex_oauth_client_id")?.valueJson, "");
        return typeof raw === "string" ? raw.trim() : "";
      })(),
      yandexOauthClientSecret: (() => {
        const raw = getValueJson(
          adminSettingsList.find((x) => x.key === "yandex_oauth_client_secret")?.valueJson,
          "",
        );
        return typeof raw === "string" ? raw.trim() : "";
      })(),
      yandexOauthRedirectUri: (() => {
        const raw = getValueJson(
          adminSettingsList.find((x) => x.key === "yandex_oauth_redirect_uri")?.valueJson,
          "",
        );
        return typeof raw === "string" ? raw.trim() : "";
      })(),
      googleClientId: adminStr("google_client_id"),
      googleClientSecret: adminStr("google_client_secret"),
      googleOauthLoginRedirectUri: adminStr("google_oauth_login_redirect_uri"),
      appleOauthClientId: adminStr("apple_oauth_client_id"),
      appleOauthTeamId: adminStr("apple_oauth_team_id"),
      appleOauthKeyId: adminStr("apple_oauth_key_id"),
      appleOauthPrivateKey: adminStr("apple_oauth_private_key"),
      appleOauthRedirectUri: adminStr("apple_oauth_redirect_uri"),
    },
    googleCalendarConfig: {
      googleClientId: adminStr("google_client_id"),
      googleClientSecret: adminStr("google_client_secret"),
      googleRedirectUri: adminStr("google_redirect_uri"),
      googleRefreshToken: adminStr("google_refresh_token"),
      googleCalendarId: adminStr("google_calendar_id"),
      googleCalendarEnabled: (() => {
        const raw = getValueJson<unknown>(
          adminSettingsList.find((x) => x.key === "google_calendar_enabled")?.valueJson,
          false,
        );
        return raw === true || raw === "true";
      })(),
      googleConnectedEmail: adminStr("google_connected_email"),
    },
    notificationsTopicsRows: parseNotificationsTopics(
      adminSettingsList.find((x) => x.key === "notifications_topics")?.valueJson ?? null,
    ),
    smtpOutboundUi: parseAdminSmtpOutboundForUi(adminSettingsList),
    webPushVapidUi: (() => {
      const row = adminSettingsList.find((x) => x.key === "web_push_vapid");
      const inner = row ? getValueJson<unknown>(row.valueJson, null) : null;
      let publicKey = "";
      let hasStoredPrivateKey = false;
      if (inner !== null && typeof inner === "object" && !Array.isArray(inner)) {
        const o = inner as Record<string, unknown>;
        publicKey = typeof o.publicKey === "string" ? o.publicKey.trim() : "";
        if (typeof o.hasPrivateKey === "boolean") {
          hasStoredPrivateKey = o.hasPrivateKey;
        } else {
          const pk = typeof o.privateKey === "string" ? o.privateKey.trim() : "";
          hasStoredPrivateKey = pk.length > 0;
        }
      }
      return { publicKey, hasStoredPrivateKey };
    })(),
  };
}
