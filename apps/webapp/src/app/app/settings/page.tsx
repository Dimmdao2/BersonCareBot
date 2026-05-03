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
import { AdminModeToggle } from "./AdminModeToggle";
import { AdminSettingsTabsClient } from "./AdminSettingsTabsClient";
import { AdminSettingsSection, type IntegratorLinkedPhoneSource } from "./AdminSettingsSection";
import { VideoPrivateMediaSettingsSection } from "./VideoPrivateMediaSettingsSection";
import { VideoHlsWatermarkSettingsSection } from "./VideoHlsWatermarkSettingsSection";
import { AppParametersSection } from "./AppParametersSection";
import { NotificationsTopicsSection } from "./NotificationsTopicsSection";
import { AuthProvidersSection } from "./AuthProvidersSection";
import { BookingCatalogHelp } from "./BookingCatalogHelp";
import { RubitimeSection } from "./RubitimeSection";
import { GoogleCalendarSection } from "./GoogleCalendarSection";
import { AdminAuditLogSection } from "./AdminAuditLogSection";
import { SystemHealthSection } from "./SystemHealthSection";
import { parseNotificationsTopics } from "@/modules/patient-notifications/notificationsTopics";

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

export default async function SettingsPage() {
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

  const adminMode = session.adminMode ?? false;
  const isAdmin = session.user.role === "admin";

  const adminSettingsList = isAdmin && adminMode
    ? await deps.systemSettings.listSettingsByScope("admin")
    : [];

  function adminStr(key: string): string {
    const raw = getValueJson(adminSettingsList.find((x) => x.key === key)?.valueJson, "");
    return typeof raw === "string" ? raw.trim() : "";
  }

  const adminSettings = isAdmin && adminMode
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
      }
    : null;

  const videoPresignTtlInitial =
    isAdmin && adminMode
      ? (() => {
          const raw = getValueJson<unknown>(
            adminSettingsList.find((x) => x.key === "video_presign_ttl_seconds")?.valueJson,
            3600,
          );
          const n =
            typeof raw === "number" && Number.isFinite(raw)
              ? raw
              : typeof raw === "string" && /^\d+$/.test(raw.trim())
                ? Number.parseInt(raw.trim(), 10)
                : 3600;
          const clamped = Math.min(VIDEO_PRESIGN_TTL_MAX_SEC, Math.max(VIDEO_PRESIGN_TTL_MIN_SEC, Math.round(n)));
          return clamped;
        })()
      : 3600;

  const videoWatermarkInitial =
    isAdmin && adminMode
      ? (() => {
          const raw = getValueJson<unknown>(
            adminSettingsList.find((x) => x.key === "video_watermark_enabled")?.valueJson,
            false,
          );
          return raw === true || raw === "true";
        })()
      : false;

  const appParametersConfig = isAdmin && adminMode
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

  const authProvidersConfig = isAdmin && adminMode
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

  const googleCalendarConfig = isAdmin && adminMode
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
    isAdmin && adminMode
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
        <div className="mt-6">
          <AdminModeToggle adminMode={adminMode} />
        </div>
      )}
      {isAdmin && adminMode && adminSettings && (
        <div className="mt-6">
          <AdminSettingsTabsClient
            diagnostics={
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
            }
            systemHealth={<SystemHealthSection />}
            appParams={
              appParametersConfig ? (
                <>
                  <AppParametersSection {...appParametersConfig} />
                  <VideoPrivateMediaSettingsSection initialTtlSeconds={videoPresignTtlInitial} />
                  <VideoHlsWatermarkSettingsSection initialEnabled={videoWatermarkInitial} />
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
