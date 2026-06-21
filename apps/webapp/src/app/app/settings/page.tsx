import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/auth/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";
import { ADMIN_TAB_REDIRECTS, parseHealthArchiveProbeParam } from "./adminSettingsData";
import { DoctorAccountEmailSection } from "./DoctorAccountEmailSection";
import { SettingsForm } from "./SettingsForm";
import { DoctorNotificationChannelsSection } from "./DoctorNotificationChannelsSection";
import { buildDoctorNotificationTopicModels } from "@/modules/doctor-notifications/doctorProfileTopicChannelsModel";
import { parseSpecialistTaskReminderChannels } from "@/modules/specialist-tasks/reminderChannels";
import { DoctorTimezoneSection } from "./DoctorTimezoneSection";
import { AppointmentReminderSettingsSection } from "./AppointmentReminderSettingsSection";
import { runWebappPgText } from "@/infra/db/runWebappSql";

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

  // Legacy adminTab redirect support (deep links like ?adminTab=integrations still work)
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
  const appointmentReminderEnabled = getValueJson(
    doctorSettings.find((x) => x.key === "doctor_appointment_reminder_enabled")?.valueJson,
    false,
  );
  const appointmentReminderOffsetsRaw = getValueJson<unknown>(
    doctorSettings.find((x) => x.key === "doctor_appointment_reminder_offsets_minutes")?.valueJson,
    null,
  );
  const appointmentReminderOffsets: number[] = Array.isArray(appointmentReminderOffsetsRaw)
    ? (appointmentReminderOffsetsRaw as unknown[]).filter(
        (x): x is number => typeof x === "number" && Number.isInteger(x) && x > 0,
      )
    : [];
  const accountEmail = await deps.userProjection.getProfileEmailFields(session.user.userId);
  const tzRow = await runWebappPgText<{ calendar_timezone: string | null }>(
    `SELECT calendar_timezone FROM platform_users WHERE id = $1::uuid`,
    [session.user.userId],
  );
  const doctorCalendarTimezone = tzRow.rows[0]?.calendar_timezone ?? null;
  const emailVerified = Boolean(accountEmail.emailVerifiedAt);
  const hasTelegram = Boolean(session.user.bindings.telegramId?.trim());
  const hasMax = Boolean(session.user.bindings.maxId?.trim());
  const hasWebPushSubscription = await deps.webPushSubscriptions.hasAnyForUserId(session.user.userId);
  const channelPrefs = await deps.channelPreferencesPort.getPreferences(session.user.userId);
  const globalWebPushEnabled =
    channelPrefs.find((p) => p.channelCode === "web_push")?.isEnabledForNotifications !== false;
  const prefRows = await deps.topicChannelPrefs.listByUserId(session.user.userId);
  const notificationTopics = buildDoctorNotificationTopicModels(
    prefRows,
    {
      hasTelegram,
      hasMax,
      emailVerified,
      hasWebPushSubscription,
      globalWebPushEnabled,
    },
    taskReminderChannels,
  );

  return (
    <DoctorAppShell title="Настройки" user={session.user}>
      <DoctorPageHeader title="Настройки" />
      <DoctorAccountEmailSection
        initialEmail={accountEmail.email}
        emailVerified={Boolean(accountEmail.emailVerifiedAt)}
      />
      <DoctorNotificationChannelsSection
        initialTopics={notificationTopics}
        hasWebPushSubscription={hasWebPushSubscription}
        globalWebPushEnabled={globalWebPushEnabled}
        hasTelegram={hasTelegram}
        hasMax={hasMax}
        emailVerified={emailVerified}
      />
      <SettingsForm
        patientLabel={String(patientLabel)}
        smsFallbackEnabled={Boolean(smsFallbackEnabled)}
        supportCommentsWithoutSupportDefault={Boolean(supportCommentsWithoutSupportDefault)}
        supportMediaWithoutSupportDefault={Boolean(supportMediaWithoutSupportDefault)}
      />
      <DoctorTimezoneSection initialTimezone={doctorCalendarTimezone} />
      <AppointmentReminderSettingsSection
        initialEnabled={Boolean(appointmentReminderEnabled)}
        initialOffsetsMinutes={appointmentReminderOffsets}
      />
    </DoctorAppShell>
  );
}
