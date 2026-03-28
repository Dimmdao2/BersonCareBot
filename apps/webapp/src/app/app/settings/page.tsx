import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/auth/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { DoctorHeader } from "@/shared/ui/DoctorHeader";
import { SettingsForm } from "./SettingsForm";
import { AdminModeToggle } from "./AdminModeToggle";
import { AdminSettingsSection } from "./AdminSettingsSection";
import { RuntimeConfigSection } from "./RuntimeConfigSection";

function getValueJson<T>(valueJson: unknown, fallback: T): T {
  if (valueJson !== null && typeof valueJson === "object" && "value" in (valueJson as Record<string, unknown>)) {
    return (valueJson as Record<string, unknown>).value as T;
  }
  return fallback;
}

function idArrayToString(settings: Array<{ key: string; valueJson: unknown }>, key: string): string {
  const entry = settings.find((x) => x.key === key);
  if (!entry) return "[]";
  const arr = getValueJson<unknown>(entry.valueJson, []);
  if (Array.isArray(arr)) return JSON.stringify(arr);
  return "[]";
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
          const v = getValueJson<unknown>(adminSettingsList.find((x) => x.key === "integration_test_ids")?.valueJson, []);
          return Array.isArray(v) ? (v as string[]) : [];
        })(),
        importantFallbackDelayMinutes: Number(getValueJson(adminSettingsList.find((x) => x.key === "important_fallback_delay_minutes")?.valueJson, 60)),
      }
    : null;

  const runtimeConfig = isAdmin && adminMode
    ? {
        integratorApiUrl: String(getValueJson(adminSettingsList.find((x) => x.key === "integrator_api_url")?.valueJson, "") ?? ""),
        bookingUrl: String(getValueJson(adminSettingsList.find((x) => x.key === "booking_url")?.valueJson, "") ?? ""),
        telegramBotUsername: String(getValueJson(adminSettingsList.find((x) => x.key === "telegram_bot_username")?.valueJson, "") ?? ""),
        allowedTelegramIds: idArrayToString(adminSettingsList, "allowed_telegram_ids"),
        allowedMaxIds: idArrayToString(adminSettingsList, "allowed_max_ids"),
        adminTelegramIds: idArrayToString(adminSettingsList, "admin_telegram_ids"),
        doctorTelegramIds: idArrayToString(adminSettingsList, "doctor_telegram_ids"),
        adminMaxIds: idArrayToString(adminSettingsList, "admin_max_ids"),
        doctorMaxIds: idArrayToString(adminSettingsList, "doctor_max_ids"),
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
              <AdminSettingsSection {...adminSettings} />
            </div>
          )}
          {isAdmin && adminMode && runtimeConfig && (
            <div className="mt-6">
              <RuntimeConfigSection {...runtimeConfig} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
