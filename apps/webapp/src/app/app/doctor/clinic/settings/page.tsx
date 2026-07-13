import { requireClinicManagementDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { SettingsForm } from "@/app/app/settings/SettingsForm";
import { AppointmentReminderSettingsSection } from "@/app/app/settings/AppointmentReminderSettingsSection";
import { BookingEventNotificationsSection } from "@/app/app/settings/BookingEventNotificationsSection";
import { NotificationsTopicsSection } from "@/app/app/settings/NotificationsTopicsSection";
import { PatientHomeDailyWarmupRotationPanel } from "@/app/app/settings/patient-home/PatientHomeDailyWarmupRotationPanel";
import { PatientHomeMorningPingPanel } from "@/app/app/settings/patient-home/PatientHomeMorningPingPanel";
import { PatientHomePracticeTargetPanel } from "@/app/app/settings/patient-home/PatientHomePracticeTargetPanel";
import { PatientHomeRepeatCooldownPanel } from "@/app/app/settings/patient-home/PatientHomeRepeatCooldownPanel";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  parsePatientHomeDailyWarmupRepeatCooldownMinutes,
  parsePatientTreatmentPlanItemDoneRepeatCooldownMinutes,
} from "@/modules/patient-home/patientHomeRepeatCooldownSettings";
import {
  parsePatientHomeDailyWarmupRotationEnabled,
  parsePatientHomeDailyWarmupRotationTimes,
} from "@/modules/patient-home/patientHomeDailyWarmupRotationSettings";
import {
  parsePatientHomeMorningPingEnabled,
  parsePatientHomeMorningPingLocalTime,
} from "@/modules/patient-home/patientHomeMorningPingSettings";
import { parsePatientHomeDailyPracticeTarget } from "@/modules/patient-home/todayConfig";
import { parseNotificationsTopics } from "@/modules/patient-notifications/notificationsTopics";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";

function getValueJson<T>(valueJson: unknown, fallback: T): T {
  if (valueJson !== null && typeof valueJson === "object" && "value" in (valueJson as Record<string, unknown>)) {
    return (valueJson as Record<string, unknown>).value as T;
  }
  return fallback;
}

export default async function DoctorClinicSettingsPage() {
  const workspace = await requireClinicManagementDoctorPage();
  const deps = buildAppDeps();
  const [doctorSettings, adminSettings] = await Promise.all([
    deps.systemSettings.listSettingsByScope("doctor", { organizationId: workspace.organizationId }),
    deps.systemSettings.listSettingsByScope("admin", { organizationId: workspace.organizationId }),
  ]);

  const patientLabel = getValueJson(doctorSettings.find((x) => x.key === "patient_label")?.valueJson, "пациент");
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
  const appointmentReminderEnabled = getValueJson(
    doctorSettings.find((x) => x.key === "doctor_appointment_reminder_enabled")?.valueJson,
    false,
  );
  const appointmentReminderOffsetsRaw = getValueJson<unknown>(
    doctorSettings.find((x) => x.key === "doctor_appointment_reminder_offsets_minutes")?.valueJson,
    null,
  );
  const appointmentReminderOffsets: number[] = Array.isArray(appointmentReminderOffsetsRaw)
    ? appointmentReminderOffsetsRaw.filter(
        (x): x is number => typeof x === "number" && Number.isInteger(x) && x > 0,
      )
    : [];

  const practiceSetting = adminSettings.find((x) => x.key === "patient_home_daily_practice_target");
  const morningPingEnabled = adminSettings.find((x) => x.key === "patient_home_morning_ping_enabled");
  const morningPingTime = adminSettings.find((x) => x.key === "patient_home_morning_ping_local_time");
  const warmupRotationEnabled = adminSettings.find((x) => x.key === "patient_home_daily_warmup_rotation_enabled");
  const warmupRotationTimes = adminSettings.find((x) => x.key === "patient_home_daily_warmup_rotation_times");
  const warmupCooldown = adminSettings.find((x) => x.key === "patient_home_daily_warmup_repeat_cooldown_minutes");
  const planItemCooldown = adminSettings.find(
    (x) => x.key === "patient_treatment_plan_item_done_repeat_cooldown_minutes",
  );
  const notificationsTopics = adminSettings.find((x) => x.key === "notifications_topics");

  return (
    <DoctorAppShell title="Настройки клиники">
      <DoctorPageHeader title="Настройки клиники" subtitle="Параметры текущей организации" />
      <SettingsForm
        patientLabel={String(patientLabel)}
        smsFallbackEnabled={false}
        supportCommentsWithoutSupportDefault={Boolean(supportCommentsWithoutSupportDefault)}
        supportMediaWithoutSupportDefault={Boolean(supportMediaWithoutSupportDefault)}
        settingsEndpoint="/api/admin/settings"
        showSmsFallback={false}
      />
      <AppointmentReminderSettingsSection
        initialEnabled={Boolean(appointmentReminderEnabled)}
        initialOffsetsMinutes={appointmentReminderOffsets}
        settingsEndpoint="/api/admin/settings"
      />
      <PatientHomePracticeTargetPanel
        initialTarget={parsePatientHomeDailyPracticeTarget(practiceSetting?.valueJson ?? null)}
        settingsEndpoint="/api/admin/settings"
      />
      <PatientHomeRepeatCooldownPanel
        initialWarmupMinutes={parsePatientHomeDailyWarmupRepeatCooldownMinutes(warmupCooldown?.valueJson ?? null)}
        initialPlanItemMinutes={parsePatientTreatmentPlanItemDoneRepeatCooldownMinutes(
          planItemCooldown?.valueJson ?? null,
        )}
        settingsEndpoint="/api/admin/settings"
      />
      <div className="flex flex-col gap-3">
        <PatientHomeDailyWarmupRotationPanel
          initialEnabled={parsePatientHomeDailyWarmupRotationEnabled(warmupRotationEnabled?.valueJson ?? null)}
          initialTimes={parsePatientHomeDailyWarmupRotationTimes(warmupRotationTimes?.valueJson ?? null)}
        />
        <PatientHomeMorningPingPanel
          initialEnabled={parsePatientHomeMorningPingEnabled(morningPingEnabled?.valueJson ?? null)}
          initialLocalTime={parsePatientHomeMorningPingLocalTime(morningPingTime?.valueJson ?? null)}
        />
      </div>
      <BookingEventNotificationsSection layout="compact" />
      <NotificationsTopicsSection initialRows={parseNotificationsTopics(notificationsTopics?.valueJson ?? null)} />
    </DoctorAppShell>
  );
}
