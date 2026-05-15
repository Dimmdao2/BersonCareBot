import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/auth/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { env } from "@/config/env";
import { DEFAULT_APP_DISPLAY_TIMEZONE } from "@/modules/system-settings/appDisplayTimezone";
import { DEFAULT_SUPPORT_CONTACT_URL } from "@/modules/system-settings/supportContactConstants";
import {
  DEFAULT_PATIENT_BOOKING_URL,
  DEFAULT_PATIENT_MAINTENANCE_MESSAGE,
} from "@/modules/system-settings/patientMaintenance";
import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctorWorkspaceLayout";
import { parseIdTokens } from "@/shared/parsers/parseIdTokens";
import { normalizeTestAccountIdentifiersValue } from "@/modules/system-settings/testAccounts";
import {
  VIDEO_PRESIGN_TTL_MAX_SEC,
  VIDEO_PRESIGN_TTL_MIN_SEC,
} from "@/modules/media/videoPresignTtlConstants";
import { SettingsForm } from "./SettingsForm";
import { AdminSettingsTabsClient } from "./AdminSettingsTabsClient";
import { AdminSettingsSection, type IntegratorLinkedPhoneSource } from "./AdminSettingsSection";
import { AdminIncidentAlertsSection } from "./AdminIncidentAlertsSection";
import {
  VideoSystemSettingsSection,
  type VideoDefaultDeliveryUi,
} from "./VideoSystemSettingsSection";
import { AppParametersSection } from "./AppParametersSection";
import { NotificationsTopicsSection } from "./NotificationsTopicsSection";
import { AuthProvidersSection } from "./AuthProvidersSection";
import { BookingCatalogHelp } from "./BookingCatalogHelp";
import { RubitimeSection } from "./RubitimeSection";
import { GoogleCalendarSection } from "./GoogleCalendarSection";
import { AdminAuditLogSection } from "./AdminAuditLogSection";
import { SystemHealthSection } from "./SystemHealthSection";
import { parseNotificationsTopics } from "@/modules/patient-notifications/notificationsTopics";
import { parseAdminIncidentAlertConfig } from "@/modules/admin-incidents/adminIncidentAlertConfig";

function getValueJson<T>(valueJson: unknown, fallback: T): T {
  if (valueJson !== null && typeof valueJson === "object" && "value" in (valueJson as Record<string, unknown>)) {
    return (valueJson as Record<string, unknown>).value as T;
  }
  return fallback;
}

/** Первый непустой элемент whitelist-массива в БД (для однострочного UI администратора). */
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

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ adminTab?: string | string[] }>;
}) {
  const sp = searchParams != null ? await searchParams : {};
  const adminTabRaw = sp.adminTab;
  const adminTab =
    typeof adminTabRaw === "string"
      ? adminTabRaw
      : Array.isArray(adminTabRaw) && typeof adminTabRaw[0] === "string"
        ? adminTabRaw[0]
        : undefined;
  const session = await getCurrentSession();
  if (!session) redirect("/app");
  if (session.user.role === "client") redirect("/app/patient/profile");

  const deps = buildAppDeps();
  const doctorSettings = await deps.systemSettings.listSettingsByScope("doctor");

  const patientLabel = getValueJson(doctorSettings.find((x) => x.key === "patient_label")?.valueJson, "пациент");
  const smsFallbackEnabled = getValueJson(
    doctorSettings.find((x) => x.key === "sms_fallback_enabled")?.valueJson,
    true
  );

  const isAdmin = session.user.role === "admin";

  const adminSettingsList = isAdmin
    ? await deps.systemSettings.listSettingsByScope("admin")
    : [];

  function adminStr(key: string): string {
    const raw = getValueJson(adminSettingsList.find((x) => x.key === key)?.valueJson, "");
    return typeof raw === "string" ? raw.trim() : "";
  }

  const adminSettings = isAdmin
    ? {
        devMode: Boolean(getValueJson(adminSettingsList.find((x) => x.key === "dev_mode")?.valueJson, false)),
        debugForwardToAdmin: Boolean(getValueJson(adminSettingsList.find((x) => x.key === "debug_forward_to_admin")?.valueJson, false)),
        miniappAuthVerboseServerLog: Boolean(
          getValueJson(adminSettingsList.find((x) => x.key === "max_debug_page_enabled")?.valueJson, false),
        ),
        importantFallbackDelayMinutes: Number(getValueJson(adminSettingsList.find((x) => x.key === "important_fallback_delay_minutes")?.valueJson, 60)),
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
          return normalizeTestAccountIdentifiersValue(inner) ?? {
            phones: [] as string[],
            telegramIds: [] as string[],
            maxIds: [] as string[],
          };
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
        patientBookingUrl: (() => {
          const raw = getValueJson(adminSettingsList.find((x) => x.key === "patient_booking_url")?.valueJson, "");
          const s = typeof raw === "string" ? raw.trim() : "";
          return s.length > 0 ? s : DEFAULT_PATIENT_BOOKING_URL;
        })(),
        incidentAlertsConfig: parseAdminIncidentAlertConfig(
          adminSettingsList.find((x) => x.key === "admin_incident_alert_config")?.valueJson ?? null,
        ),
      }
    : null;

  const videoSystemSettingsProps =
    isAdmin
      ? {
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
        }
      : null;

  const appParametersConfig = isAdmin
    ? {
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
      }
    : null;

  const authProvidersConfig = isAdmin
    ? {
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
      }
    : null;

  const googleCalendarConfig = isAdmin
    ? {
        googleClientId: adminStr("google_client_id"),
        googleClientSecret: adminStr("google_client_secret"),
        googleRedirectUri: adminStr("google_redirect_uri"),
        googleRefreshToken: adminStr("google_refresh_token"),
        googleCalendarId: adminStr("google_calendar_id"),
        googleCalendarEnabled: (() => {
          const raw = getValueJson<unknown>(adminSettingsList.find((x) => x.key === "google_calendar_enabled")?.valueJson, false);
          return raw === true || raw === "true";
        })(),
        googleConnectedEmail: adminStr("google_connected_email"),
      }
    : null;

  const notificationsTopicsRows =
    isAdmin
      ? parseNotificationsTopics(adminSettingsList.find((x) => x.key === "notifications_topics")?.valueJson ?? null)
      : [];

  return (
    <div className={DOCTOR_PAGE_CONTAINER_CLASS}>
      <h1 className="mb-6 text-xl font-semibold">Настройки</h1>
      <SettingsForm
        patientLabel={String(patientLabel)}
        smsFallbackEnabled={Boolean(smsFallbackEnabled)}
      />
      {isAdmin && (
        <p className="mt-6 text-sm text-muted-foreground">Режим администратора активен.</p>
      )}
      {isAdmin && adminSettings && (
        <div className="mt-6">
          <AdminSettingsTabsClient
            initialTab={adminTab}
            diagnostics={
              <>
                <AdminSettingsSection
                  devMode={adminSettings.devMode}
                  debugForwardToAdmin={adminSettings.debugForwardToAdmin}
                  miniappAuthVerboseServerLog={adminSettings.miniappAuthVerboseServerLog}
                  importantFallbackDelayMinutes={adminSettings.importantFallbackDelayMinutes}
                  platformUserMergeV2Enabled={adminSettings.platformUserMergeV2Enabled}
                  integratorLinkedPhoneSource={adminSettings.integratorLinkedPhoneSource}
                  adminPhone={adminSettings.adminPhone}
                  adminTelegramId={adminSettings.adminTelegramId}
                  adminMaxId={adminSettings.adminMaxId}
                  testAccountPhones={adminSettings.testAccountIdentifiers.phones.join(" ")}
                  testAccountTelegramIds={adminSettings.testAccountIdentifiers.telegramIds.join(" ")}
                  testAccountMaxIds={adminSettings.testAccountIdentifiers.maxIds.join(" ")}
                  patientAppMaintenanceEnabled={adminSettings.patientAppMaintenanceEnabled}
                  patientAppMaintenanceMessage={adminSettings.patientAppMaintenanceMessage}
                  patientBookingUrl={adminSettings.patientBookingUrl}
                />
                <AdminIncidentAlertsSection initialConfig={adminSettings.incidentAlertsConfig} />
              </>
            }
            systemHealth={<SystemHealthSection />}
            appParams={
              appParametersConfig && videoSystemSettingsProps ? (
                <>
                  <AppParametersSection {...appParametersConfig} />
                  <VideoSystemSettingsSection {...videoSystemSettingsProps} />
                  <NotificationsTopicsSection initialRows={notificationsTopicsRows} />
                </>
              ) : null
            }
            auth={authProvidersConfig ? <AuthProvidersSection {...authProvidersConfig} /> : null}
            integrations={
              googleCalendarConfig ? <GoogleCalendarSection {...googleCalendarConfig} /> : null
            }
            catalog={
              <>
                <BookingCatalogHelp />
                <RubitimeSection />
              </>
            }
            auditLog={<AdminAuditLogSection />}
          />
        </div>
      )}
    </div>
  );
}
