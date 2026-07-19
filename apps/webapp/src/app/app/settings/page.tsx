import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { requireDoctorWorkspaceContext } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";
import { StaffPwaInstallSection } from "@/shared/ui/doctor/pwa/StaffPwaInstallSection";
import { DoctorSection, DoctorSectionHeader, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { DoctorAccountEmailSection } from "./DoctorAccountEmailSection";
import { SettingsForm } from "./SettingsForm";
import { DoctorNotificationChannelsSection } from "./DoctorNotificationChannelsSection";
import { DoctorTimezoneSection } from "./DoctorTimezoneSection";
import { AppointmentReminderSettingsSection } from "./AppointmentReminderSettingsSection";
import { SettingsHubTabs, type SettingsHubTab } from "./SettingsHubTabs";
import { buildDoctorNotificationTopicModels } from "@/modules/doctor-notifications/doctorProfileTopicChannelsModel";
import { parseSpecialistTaskReminderChannels } from "@/modules/specialist-tasks/reminderChannels";
import { getDoctorAccountTimezone } from "@/app-layer/doctor/accountTimezone";
import { ADMIN_TAB_REDIRECTS, parseHealthArchiveProbeParam } from "./adminSettingsData";

function valueOf<T>(valueJson: unknown, fallback: T): T {
  return valueJson !== null && typeof valueJson === "object" && "value" in (valueJson as Record<string, unknown>)
    ? (valueJson as Record<string, unknown>).value as T
    : fallback;
}

function parseTab(raw: string | string[] | undefined): SettingsHubTab {
  const value = typeof raw === "string" ? raw : raw?.[0];
  return value === "organization" || value === "billing" || value === "install" ? value : "specialist";
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string | string[]; adminTab?: string | string[]; probe?: string | string[] }>;
}) {
  const sp = searchParams != null ? await searchParams : {};
  const legacyAdminTab = typeof sp.adminTab === "string" ? sp.adminTab : sp.adminTab?.[0];
  if (legacyAdminTab && ADMIN_TAB_REDIRECTS[legacyAdminTab]) {
    const target = ADMIN_TAB_REDIRECTS[legacyAdminTab];
    const probe = parseHealthArchiveProbeParam(sp.probe);
    redirect(probe ? `${target}?probe=${encodeURIComponent(probe)}` : target);
  }

  const workspace = await requireDoctorWorkspaceContext();
  const canManageOrganization = workspace.canManageOrganization ||
    (workspace.session.user.role === "admin" && workspace.session.adminMode === true);
  const isGlobalAdmin = workspace.session.user.role === "admin" && workspace.session.adminMode === true;
  // C3 has no separate payer role yet. Until C5 supplies one, only the organization owner (or global admin)
  // may see the intentionally non-interactive billing shell.
  const canAccessBilling = workspace.membershipRole === "owner" || isGlobalAdmin;
  const tab = parseTab(sp.tab);
  if (tab === "organization" && !canManageOrganization) redirect("/app/settings");
  if (tab === "billing" && !canAccessBilling) redirect("/app/settings");

  const deps = buildAppDeps();
  const doctorSettings = await deps.systemSettings.listSettingsByScope("doctor", { organizationId: workspace.organizationId });
  const patientLabel = valueOf(doctorSettings.find((x) => x.key === "patient_label")?.valueJson, "пациент");
  const tabs = [
    { id: "specialist" as const, label: "Специалист" },
    ...(canManageOrganization ? [{ id: "organization" as const, label: "Практика" }] : []),
    ...(canAccessBilling ? [{ id: "billing" as const, label: "Тариф и биллинг" }] : []),
    { id: "install" as const, label: "Установить приложение" },
  ];

  let content: ReactNode;
  if (tab === "install") {
    content = <DoctorSection><DoctorSectionHeader><DoctorSectionTitle>Установка на устройство</DoctorSectionTitle></DoctorSectionHeader><StaffPwaInstallSection /></DoctorSection>;
  } else if (tab === "organization") {
    const appointmentReminderEnabled = valueOf(
      doctorSettings.find((x) => x.key === "doctor_appointment_reminder_enabled")?.valueJson,
      false,
    );
    const appointmentReminderOffsets = valueOf<unknown>(
      doctorSettings.find((x) => x.key === "doctor_appointment_reminder_offsets_minutes")?.valueJson,
      [],
    );
    content = <>
      <SettingsForm patientLabel={String(patientLabel)} smsFallbackEnabled={false} supportCommentsWithoutSupportDefault={false} supportMediaWithoutSupportDefault={false} settingsEndpoint="/api/admin/settings" showSmsFallback={false} showSupportDefaults={false} />
      <AppointmentReminderSettingsSection
        initialEnabled={Boolean(appointmentReminderEnabled)}
        initialOffsetsMinutes={Array.isArray(appointmentReminderOffsets) ? appointmentReminderOffsets.filter((value): value is number => Number.isSafeInteger(value) && value > 0) : []}
        settingsEndpoint="/api/admin/settings"
      />
    </>;
  } else if (tab === "billing") {
    content = <DoctorSection><DoctorSectionHeader><DoctorSectionTitle>Тариф и биллинг</DoctorSectionTitle></DoctorSectionHeader><p className="text-sm text-muted-foreground">Коммерческие настройки станут доступны после подключения тарифа.</p></DoctorSection>;
  } else {
    const session = workspace.session;
    const accountEmail = await deps.userProjection.getProfileEmailFields(session.user.userId);
    const taskReminderChannels = parseSpecialistTaskReminderChannels(doctorSettings.find((x) => x.key === "doctor_specialist_task_reminder_channels")?.valueJson ?? null);
    const hasTelegram = Boolean(session.user.bindings.telegramId?.trim());
    const hasMax = Boolean(session.user.bindings.maxId?.trim());
    const hasWebPushSubscription = await deps.webPushSubscriptions.hasAnyForUserId(session.user.userId);
    const channelPrefs = await deps.channelPreferencesPort.getPreferences(session.user.userId);
    const globalWebPushEnabled = channelPrefs.find((p) => p.channelCode === "web_push")?.isEnabledForNotifications !== false;
    const notificationTopics = buildDoctorNotificationTopicModels(await deps.topicChannelPrefs.listByUserId(session.user.userId), { hasTelegram, hasMax, emailVerified: Boolean(accountEmail.emailVerifiedAt), hasWebPushSubscription, globalWebPushEnabled }, taskReminderChannels);
    content = <>
      <DoctorAccountEmailSection initialEmail={accountEmail.email} emailVerified={Boolean(accountEmail.emailVerifiedAt)} />
      <DoctorNotificationChannelsSection initialTopics={notificationTopics} hasWebPushSubscription={hasWebPushSubscription} globalWebPushEnabled={globalWebPushEnabled} hasTelegram={hasTelegram} hasMax={hasMax} emailVerified={Boolean(accountEmail.emailVerifiedAt)} />
      <SettingsForm patientLabel={String(patientLabel)} smsFallbackEnabled={valueOf(doctorSettings.find((x) => x.key === "sms_fallback_enabled")?.valueJson, true)} supportCommentsWithoutSupportDefault={valueOf(doctorSettings.find((x) => x.key === "doctor_patient_support_comments_without_support_default_enabled")?.valueJson, false)} supportMediaWithoutSupportDefault={valueOf(doctorSettings.find((x) => x.key === "doctor_patient_support_media_without_support_default_enabled")?.valueJson, false)} showPatientLabel={false} />
      <DoctorTimezoneSection initialTimezone={await getDoctorAccountTimezone(session.user.userId)} />
    </>;
  }

  return <DoctorAppShell title="Настройки" user={workspace.session.user}><DoctorPageHeader title="Настройки" /><div className="flex flex-col gap-3"><SettingsHubTabs activeTab={tab} tabs={tabs} />{content}</div></DoctorAppShell>;
}
