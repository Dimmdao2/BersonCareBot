import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/auth/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctorWorkspaceLayout";
import { ADMIN_TAB_REDIRECTS, parseHealthArchiveProbeParam } from "./adminSettingsData";
import { SettingsForm } from "./SettingsForm";
import { parseSpecialistTaskReminderChannels } from "@/modules/specialist-tasks/reminderChannels";

function getValueJson<T>(valueJson: unknown, fallback: T): T {
  if (valueJson !== null && typeof valueJson === "object" && "value" in (valueJson as Record<string, unknown>)) {
    return (valueJson as Record<string, unknown>).value as T;
  }
  return fallback;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ adminTab?: string | string[]; probe?: string | string[] }>;
}) {
  const sp = searchParams != null ? await searchParams : {};
  const adminTabRaw = sp.adminTab;
  const adminTab =
    typeof adminTabRaw === "string"
      ? adminTabRaw
      : Array.isArray(adminTabRaw) && typeof adminTabRaw[0] === "string"
        ? adminTabRaw[0]
        : undefined;

  if (adminTab) {
    const target = ADMIN_TAB_REDIRECTS[adminTab];
    if (target) {
      const probe = parseHealthArchiveProbeParam(sp.probe);
      const url = probe ? `${target}?probe=${encodeURIComponent(probe)}` : target;
      redirect(url);
    }
  }

  const session = await getCurrentSession();
  if (!session) redirect("/app");
  if (session.user.role === "client") redirect("/app/patient/profile");

  const deps = buildAppDeps();
  const doctorSettings = await deps.systemSettings.listSettingsByScope("doctor");

  const patientLabel = getValueJson(doctorSettings.find((x) => x.key === "patient_label")?.valueJson, "пациент");
  const smsFallbackEnabled = getValueJson(
    doctorSettings.find((x) => x.key === "sms_fallback_enabled")?.valueJson,
    true,
  );
  const supportCommentsWithoutSupportDefault = getValueJson(
    doctorSettings.find(
      (x) => x.key === "doctor_patient_support_comments_without_support_default_enabled",
    )?.valueJson,
    false,
  );
  const supportMediaWithoutSupportDefault = getValueJson(
    doctorSettings.find((x) => x.key === "doctor_patient_support_media_without_support_default_enabled")?.valueJson,
    false,
  );
  const taskReminderChannels = parseSpecialistTaskReminderChannels(
    doctorSettings.find((x) => x.key === "doctor_specialist_task_reminder_channels")?.valueJson ?? null,
  );

  return (
    <div className={DOCTOR_PAGE_CONTAINER_CLASS}>
      <h1 className="mb-6 text-xl font-semibold">Настройки специалиста</h1>
      <SettingsForm
        patientLabel={String(patientLabel)}
        smsFallbackEnabled={Boolean(smsFallbackEnabled)}
        supportCommentsWithoutSupportDefault={Boolean(supportCommentsWithoutSupportDefault)}
        supportMediaWithoutSupportDefault={Boolean(supportMediaWithoutSupportDefault)}
        taskReminderChannels={taskReminderChannels}
      />
    </div>
  );
}
