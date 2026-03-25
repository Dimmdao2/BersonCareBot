import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/auth/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { DoctorHeader } from "@/shared/ui/DoctorHeader";
import { SettingsForm } from "./SettingsForm";
import { AdminModeToggle } from "./AdminModeToggle";
import { AdminSettingsSection } from "./AdminSettingsSection";

export default async function SettingsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/app");
  if (session.user.role === "client") redirect("/app/patient/profile");

  const deps = buildAppDeps();
  const doctorSettings = await deps.systemSettings.listSettingsByScope("doctor");

  function getSettingValue<T>(settings: typeof doctorSettings, key: string, fallback: T): T {
    const s = settings.find((x) => x.key === key);
    if (!s) return fallback;
    const v = s.valueJson;
    if (v !== null && typeof v === "object" && "value" in (v as Record<string, unknown>)) {
      return (v as Record<string, unknown>).value as T;
    }
    return fallback;
  }

  const patientLabel = getSettingValue(doctorSettings, "patient_label", "пациент");
  const smsFallbackEnabled = getSettingValue(doctorSettings, "sms_fallback_enabled", true);

  const adminMode = session.adminMode ?? false;

  let adminSettings: {
    devMode: boolean;
    debugForwardToAdmin: boolean;
    integrationTestIds: string[];
    importantFallbackDelayMinutes: number;
  } | null = null;

  if (session.user.role === "admin" && adminMode) {
    const adminSettingsList = await deps.systemSettings.listSettingsByScope("admin");

    function getAdminValue<T>(key: string, fallback: T): T {
      const s = adminSettingsList.find((x) => x.key === key);
      if (!s) return fallback;
      const v = s.valueJson;
      if (v !== null && typeof v === "object" && "value" in (v as Record<string, unknown>)) {
        return (v as Record<string, unknown>).value as T;
      }
      return fallback;
    }

    adminSettings = {
      devMode: Boolean(getAdminValue("dev_mode", false)),
      debugForwardToAdmin: Boolean(getAdminValue("debug_forward_to_admin", false)),
      integrationTestIds: Array.isArray(getAdminValue("integration_test_ids", []))
        ? (getAdminValue("integration_test_ids", []) as string[])
        : [],
      importantFallbackDelayMinutes: Number(getAdminValue("important_fallback_delay_minutes", 60)),
    };
  }

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
          {session.user.role === "admin" && (
            <div className="mt-6">
              <AdminModeToggle adminMode={adminMode} />
            </div>
          )}
          {session.user.role === "admin" && adminMode && adminSettings && (
            <div className="mt-6">
              <AdminSettingsSection {...adminSettings} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
