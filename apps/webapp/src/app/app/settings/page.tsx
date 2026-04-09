import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/auth/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { DEFAULT_APP_DISPLAY_TIMEZONE } from "@/modules/system-settings/appDisplayTimezone";
import { DEFAULT_SUPPORT_CONTACT_URL } from "@/modules/system-settings/supportContactConstants";
import { DoctorHeader } from "@/shared/ui/DoctorHeader";
import { parseIdTokens } from "@/shared/parsers/parseIdTokens";
import { SettingsForm } from "./SettingsForm";
import { AdminModeToggle } from "./AdminModeToggle";
import { AdminSettingsTabsClient } from "./AdminSettingsTabsClient";
import { AdminSettingsSection } from "./AdminSettingsSection";
import { AppParametersSection } from "./AppParametersSection";
import { AuthProvidersSection } from "./AuthProvidersSection";
import { AccessListsSection } from "./AccessListsSection";
import { BookingCatalogHelp } from "./BookingCatalogHelp";
import { RubitimeSection } from "./RubitimeSection";
import { GoogleCalendarSection } from "./GoogleCalendarSection";
import { AdminAuditLogSection } from "./AdminAuditLogSection";

function getValueJson<T>(valueJson: unknown, fallback: T): T {
  if (valueJson !== null && typeof valueJson === "object" && "value" in (valueJson as Record<string, unknown>)) {
    return (valueJson as Record<string, unknown>).value as T;
  }
  return fallback;
}

function idArrayToString(settings: Array<{ key: string; valueJson: unknown }>, key: string): string {
  const entry = settings.find((x) => x.key === key);
  if (!entry) return "";
  const raw = getValueJson<unknown>(entry.valueJson, "");
  return parseIdTokens(raw).join(" ");
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

  const adminSettings = isAdmin && adminMode
    ? {
        devMode: Boolean(getValueJson(adminSettingsList.find((x) => x.key === "dev_mode")?.valueJson, false)),
        debugForwardToAdmin: Boolean(getValueJson(adminSettingsList.find((x) => x.key === "debug_forward_to_admin")?.valueJson, false)),
        integrationTestIds: (() => {
          const v = getValueJson<unknown>(adminSettingsList.find((x) => x.key === "integration_test_ids")?.valueJson, "");
          return parseIdTokens(v);
        })(),
        importantFallbackDelayMinutes: Number(getValueJson(adminSettingsList.find((x) => x.key === "important_fallback_delay_minutes")?.valueJson, 60)),
      }
    : null;

  const appParametersConfig = isAdmin && adminMode
    ? {
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
      }
    : null;

  const accessListsConfig = isAdmin && adminMode
    ? {
        allowedTelegramIds: idArrayToString(adminSettingsList, "allowed_telegram_ids"),
        allowedMaxIds: idArrayToString(adminSettingsList, "allowed_max_ids"),
        adminTelegramIds: idArrayToString(adminSettingsList, "admin_telegram_ids"),
        doctorTelegramIds: idArrayToString(adminSettingsList, "doctor_telegram_ids"),
        adminMaxIds: idArrayToString(adminSettingsList, "admin_max_ids"),
        doctorMaxIds: idArrayToString(adminSettingsList, "doctor_max_ids"),
      }
    : null;

  function adminStr(key: string): string {
    const raw = getValueJson(adminSettingsList.find((x) => x.key === key)?.valueJson, "");
    return typeof raw === "string" ? raw.trim() : "";
  }

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

  return (
    <div className="min-h-screen bg-muted/30">
      <DoctorHeader userDisplayName={session.user.displayName} adminMode={adminMode} />
      <div className="pt-14">
        <div className="mx-auto max-w-2xl px-4 py-6">
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
                diagnostics={<AdminSettingsSection {...adminSettings} />}
                appParams={appParametersConfig ? <AppParametersSection {...appParametersConfig} /> : null}
                auth={authProvidersConfig ? <AuthProvidersSection {...authProvidersConfig} /> : null}
                access={accessListsConfig ? <AccessListsSection {...accessListsConfig} /> : null}
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
      </div>
    </div>
  );
}
