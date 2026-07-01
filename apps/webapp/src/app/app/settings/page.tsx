import { redirect } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { getCurrentSession } from "@/modules/auth/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";
import { doctorPageTitleClass } from "@/shared/ui/doctor/doctorVisual";
import { ADMIN_TAB_REDIRECTS, parseHealthArchiveProbeParam } from "./adminSettingsData";
import { DoctorAccountEmailSection } from "./DoctorAccountEmailSection";
import { SettingsForm } from "./SettingsForm";
import { DoctorNotificationChannelsSection } from "./DoctorNotificationChannelsSection";
import { buildDoctorNotificationTopicModels } from "@/modules/doctor-notifications/doctorProfileTopicChannelsModel";
import { parseSpecialistTaskReminderChannels } from "@/modules/specialist-tasks/reminderChannels";
import { SettingsTabsNav } from "./SettingsTabsNav";
import type { SettingsTab } from "./SettingsTabsNav";
import { DoctorTimezoneSection } from "./DoctorTimezoneSection";
import { AppointmentReminderSettingsSection } from "./AppointmentReminderSettingsSection";
import { getDoctorAccountTimezone } from "@/app-layer/doctor/accountTimezone";

function getValueJson<T>(valueJson: unknown, fallback: T): T {
  if (valueJson !== null && typeof valueJson === "object" && "value" in (valueJson as Record<string, unknown>)) {
    return (valueJson as Record<string, unknown>).value as T;
  }
  return fallback;
}

const VALID_TABS: SettingsTab[] = ["specialist", "integrations", "schedule", "app", "admin", "technical"];

function parseTab(raw: string | string[] | undefined): SettingsTab {
  const s = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  if (s && VALID_TABS.includes(s as SettingsTab)) return s as SettingsTab;
  return "specialist";
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ adminTab?: string | string[]; probe?: string | string[]; tab?: string | string[] }>;
}) {
  const sp = searchParams != null ? await searchParams : {};

  // Legacy adminTab redirect support
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

  const isAdmin = session.user.role === "admin";
  const activeTab = parseTab(sp.tab);

  // Restrict admin-only tabs for non-admins
  const effectiveTab: SettingsTab =
    (activeTab === "admin" || activeTab === "technical") && !isAdmin ? "specialist" : activeTab;

  // Load specialist tab data (always needed for default tab)
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
  const doctorCalendarTimezone = await getDoctorAccountTimezone(session.user.userId);
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
    <div className={DOCTOR_PAGE_CONTAINER_CLASS}>
      <h1 className={`mb-4 ${doctorPageTitleClass}`}>Настройки</h1>

      <Suspense>
        <SettingsTabsNav isAdmin={isAdmin} />
      </Suspense>

      {effectiveTab === "specialist" && (
        <div className="space-y-4">
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
        </div>
      )}

      {effectiveTab === "integrations" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border p-4">
            <h2 className="mb-1 text-sm font-semibold">Google Календарь</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Синхронизация записей с Google Calendar. Настройки доступны в разделе администрирования.
            </p>
            <Link
              href="/app/doctor/admin/integrations"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Открыть настройки интеграций
            </Link>
          </div>
        </div>
      )}

      {effectiveTab === "schedule" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border p-4">
            <h2 className="mb-1 text-sm font-semibold">Расписание приёма</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              График работы, перерывы и управление записями.
            </p>
            <Link
              href="/app/doctor/schedule"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Открыть расписание
            </Link>
          </div>
          {isAdmin && (
            <div className="rounded-lg border border-border p-4">
              <h2 className="mb-1 text-sm font-semibold">Настройки записи (администратор)</h2>
              <p className="mb-3 text-sm text-muted-foreground">
                Услуги, локации, правила записи, оплаты и форма онлайн-записи.
              </p>
              <Link
                href="/app/doctor/admin/booking"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Открыть настройки записи
              </Link>
            </div>
          )}
        </div>
      )}

      {effectiveTab === "app" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border p-4">
            <h2 className="mb-1 text-sm font-semibold">Установить кабинет как приложение</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Установите кабинет врача на телефон или компьютер для быстрого доступа.
            </p>
            <Link
              href="/app/doctor/install"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Установить приложение
            </Link>
          </div>
          {isAdmin && (
            <div className="rounded-lg border border-border p-4">
              <h2 className="mb-1 text-sm font-semibold">Настройки приложения для пациентов</h2>
              <p className="mb-3 text-sm text-muted-foreground">
                Внешний вид и параметры пациентского приложения.
              </p>
              <Link
                href="/app/doctor/admin/app-settings"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Открыть настройки приложения
              </Link>
            </div>
          )}
        </div>
      )}

      {effectiveTab === "admin" && isAdmin && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border p-4">
            <h2 className="mb-2 text-sm font-semibold">Разделы администрирования</h2>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/app/doctor/admin/app-settings"
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Настройки приложения
                </Link>
              </li>
              <li>
                <Link
                  href="/app/doctor/admin/auth"
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Авторизация
                </Link>
              </li>
              <li>
                <Link
                  href="/app/doctor/admin/integrations"
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Интеграции
                </Link>
              </li>
              <li>
                <Link
                  href="/app/doctor/admin/technical"
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Технические режимы
                </Link>
              </li>
            </ul>
          </div>
          <div className="rounded-lg border border-border p-4">
            <h2 className="mb-1 text-sm font-semibold">Мердж пациентов</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Объединение дублирующихся аккаунтов пациентов.
            </p>
            <Link
              href="/app/doctor/booking-merge"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Открыть мердж пациентов
            </Link>
          </div>
        </div>
      )}

      {effectiveTab === "technical" && isAdmin && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border p-4">
            <h2 className="mb-2 text-sm font-semibold">Технические разделы</h2>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/app/doctor/system-health"
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Здоровье системы
                </Link>
              </li>
              <li>
                <Link
                  href="/app/doctor/health-archive"
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Архив сбоев
                </Link>
              </li>
              <li>
                <Link
                  href="/app/doctor/audit-log"
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Журнал операций
                </Link>
              </li>
              <li>
                <Link
                  href="/app/doctor/admin/technical"
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Технические режимы
                </Link>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
