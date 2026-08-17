import type { ReactNode } from 'react';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { getDoctorAccountTimezone } from '@/app-layer/doctor/accountTimezone';
import { DoctorAccountEmailSection } from '@/app/app/settings/DoctorAccountEmailSection';
import { DoctorNotificationChannelsSection } from '@/app/app/settings/DoctorNotificationChannelsSection';
import { DoctorScreensToggleSection } from '@/app/app/settings/DoctorScreensToggleSection';
import { DoctorTimezoneSection } from '@/app/app/settings/DoctorTimezoneSection';
import { SettingsForm } from '@/app/app/settings/SettingsForm';
import { buildDoctorNotificationTopicModels } from '@/modules/doctor-notifications/doctorProfileTopicChannelsModel';
import { parseSpecialistTaskReminderChannels } from '@/modules/specialist-tasks/reminderChannels';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { StaffPwaInstallSection } from '@/shared/ui/doctor/pwa/StaffPwaInstallSection';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { AccountTabs, type AccountTab } from './AccountTabs';
import { loadStaffAccountPageContext } from './accountContext';
import { StaffSecuritySection } from './StaffSecuritySection';
import { StaffPasskeySection } from './StaffPasskeySection';
import { isRestrictedStaffSecuritySession } from '@/app-layer/guards/requireRole';
import { runWithStaffSecuritySelfPrincipal } from '@/app-layer/principal/staffSecuritySelfPrincipal';
import { isIndependentAuthMethodEnabled } from '@/modules/auth/authChannelPolicy';

function valueOf<T>(valueJson: unknown, fallback: T): T {
  return valueJson !== null &&
    typeof valueJson === 'object' &&
    'value' in (valueJson as Record<string, unknown>)
    ? ((valueJson as Record<string, unknown>).value as T)
    : fallback;
}

function parseTab(raw: string | string[] | undefined): AccountTab {
  const value = typeof raw === 'string' ? raw : raw?.[0];
  return value === 'security' || value === 'notifications' || value === 'install'
    ? value
    : 'profile';
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string | string[] }>;
}) {
  const sp = searchParams != null ? await searchParams : {};
  const requestedTab = parseTab(sp.tab);
  const { session, workspaceContext } = await loadStaffAccountPageContext();
  const restrictedSecuritySession = isRestrictedStaffSecuritySession(session);
  const isPlatformConsole = session.user.role === 'admin';
  const recoveryOnly =
    session.staffSecurity?.assurance === 'recovery' ||
    session.staffSecurity?.assurance === 'recovery_confirmation';
  const tab = restrictedSecuritySession ? 'security' : requestedTab;
  const deps = buildAppDeps();

  let content: ReactNode;
  if (tab === 'install') {
    content = (
      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Установка на устройство</DoctorSectionTitle>
        </DoctorSectionHeader>
        <StaffPwaInstallSection />
      </DoctorSection>
    );
  } else if (tab === 'security') {
    const [storedStatus, timezone, passkeyEnabled] = await Promise.all([
      runWithStaffSecuritySelfPrincipal(
        session.user.userId,
        'app/account:security-self',
        () => deps.staffSecurity.getStatus(),
      ),
      recoveryOnly ? Promise.resolve(null) : getDoctorAccountTimezone(session.user.userId),
      recoveryOnly ? Promise.resolve(false) : isIndependentAuthMethodEnabled('passkey'),
    ]);
    const status = storedStatus ?? {
      enrolled: false,
      recoveryConfirmed: false,
      replacementRequired: false,
      lockedUntil: null,
      sessionVersion: 0,
    };
    content = (
      <>
        <StaffSecuritySection
          initialStatus={status}
          hasProfileName={Boolean(session.user.displayName.trim())}
          hasTimezone={Boolean(timezone)}
          hasOrganization={workspaceContext !== null}
          hasSpecialistBinding={workspaceContext?.specialistId != null}
          showSpecialistFirstRun={!isPlatformConsole}
          recoveryOnly={recoveryOnly}
        />
        {passkeyEnabled ? <StaffPasskeySection /> : null}
      </>
    );
  } else if (tab === 'notifications') {
    const accountEmail = await deps.userProjection.getProfileEmailFields(session.user.userId);
    const hasTelegram = Boolean(session.user.bindings.telegramId?.trim());
    const hasMax = Boolean(session.user.bindings.maxId?.trim());
    const [hasWebPushSubscription, channelPrefs, topicPrefs, doctorSettings] = await Promise.all([
      deps.webPushSubscriptions.hasAnyForUserId(session.user.userId),
      deps.channelPreferencesPort.getPreferences(session.user.userId),
      deps.topicChannelPrefs.listByUserId(session.user.userId),
      workspaceContext?.canAccessClinicalWorkspace
        ? deps.systemSettings.listSettingsByScope('doctor', {
            organizationId: workspaceContext.organizationId,
          })
        : Promise.resolve([]),
    ]);
    const globalWebPushEnabled =
      channelPrefs.find((preference) => preference.channelCode === 'web_push')
        ?.isEnabledForNotifications !== false;
    const taskReminderChannels = parseSpecialistTaskReminderChannels(
      doctorSettings.find((setting) => setting.key === 'doctor_specialist_task_reminder_channels')
        ?.valueJson ?? null,
    );
    const notificationTopics = buildDoctorNotificationTopicModels(
      topicPrefs,
      {
        hasTelegram,
        hasMax,
        emailVerified: Boolean(accountEmail.emailVerifiedAt),
        hasWebPushSubscription,
        globalWebPushEnabled,
      },
      taskReminderChannels,
    );
    content = (
      <DoctorNotificationChannelsSection
        initialTopics={notificationTopics}
        hasWebPushSubscription={hasWebPushSubscription}
        globalWebPushEnabled={globalWebPushEnabled}
        hasTelegram={hasTelegram}
        hasMax={hasMax}
        emailVerified={Boolean(accountEmail.emailVerifiedAt)}
      />
    );
  } else {
    const accountEmail = await deps.userProjection.getProfileEmailFields(session.user.userId);
    const doctorSettings = workspaceContext?.canAccessClinicalWorkspace
      ? await deps.systemSettings.listSettingsByScope('doctor', {
          organizationId: workspaceContext.organizationId,
        })
      : [];
    content = (
      <>
        <DoctorAccountEmailSection
          initialEmail={accountEmail.email}
          emailVerified={Boolean(accountEmail.emailVerifiedAt)}
        />
        <DoctorTimezoneSection
          initialTimezone={await getDoctorAccountTimezone(session.user.userId)}
        />
        {workspaceContext?.canManageOrganization && workspaceContext.specialistId != null ? (
          <DoctorScreensToggleSection
            initialDisabled={workspaceContext.doctorScreensDisabled}
          />
        ) : null}
        {workspaceContext?.canAccessClinicalWorkspace ? (
          <SettingsForm
            patientLabel="пациент"
            supportCommentsWithoutSupportDefault={valueOf(
              doctorSettings.find(
                (setting) =>
                  setting.key === 'doctor_patient_support_comments_without_support_default_enabled',
              )?.valueJson,
              false,
            )}
            supportMediaWithoutSupportDefault={valueOf(
              doctorSettings.find(
                (setting) =>
                  setting.key === 'doctor_patient_support_media_without_support_default_enabled',
              )?.valueJson,
              false,
            )}
            showPatientLabel={false}
          />
        ) : null}
      </>
    );
  }

  if (recoveryOnly) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-3 p-4">
        <DoctorPageHeader title="Восстановление защиты" />
        {content}
      </main>
    );
  }

  return (
    <DoctorAppShell title="Аккаунт" user={session.user}>
      <DoctorPageHeader title="Аккаунт" tabs={<AccountTabs activeTab={tab} />} />
      {content}
    </DoctorAppShell>
  );
}
