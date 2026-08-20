import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { DoctorAccountEmailSection } from '@/app/app/settings/DoctorAccountEmailSection';
import { DoctorScreensToggleSection } from '@/app/app/settings/DoctorScreensToggleSection';
import { SettingsForm } from '@/app/app/settings/SettingsForm';
import { loadStaffNotificationsSection } from '@/app/app/account/staffNotificationsSection';
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
import type { DoctorWorkspaceContext } from '@/modules/doctor-workspace/types';

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

function InstallSection() {
  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Установка на устройство</DoctorSectionTitle>
      </DoctorSectionHeader>
      <StaffPwaInstallSection />
    </DoctorSection>
  );
}

async function loadProfileContent(
  deps: ReturnType<typeof buildAppDeps>,
  userId: string,
  workspaceContext: DoctorWorkspaceContext | null,
): Promise<ReactNode> {
  const accountEmail = await deps.userProjection.getProfileEmailFields(userId);
  const doctorSettings = workspaceContext?.canAccessClinicalWorkspace
    ? await deps.systemSettings.listSettingsByScope('doctor', {
        organizationId: workspaceContext.organizationId,
      })
    : [];
  return (
    <>
      <DoctorAccountEmailSection
        initialEmail={accountEmail.email}
        emailVerified={Boolean(accountEmail.emailVerifiedAt)}
      />
      {workspaceContext?.canManageOrganization && workspaceContext.specialistId != null ? (
        <DoctorScreensToggleSection initialDisabled={workspaceContext.doctorScreensDisabled} />
      ) : null}
      {workspaceContext?.canAccessClinicalWorkspace ? (
        <SettingsForm
          patientLabel="пациент"
          smsFallbackEnabled={valueOf(
            doctorSettings.find(
              (setting) =>
                setting.key === 'sms_fallback_enabled' &&
                setting.organizationId === workspaceContext.organizationId,
            )?.valueJson,
            false,
          )}
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

async function loadSecurityContent(
  deps: ReturnType<typeof buildAppDeps>,
  session: Awaited<ReturnType<typeof loadStaffAccountPageContext>>['session'],
  workspaceContext: DoctorWorkspaceContext | null,
  recoveryOnly: boolean,
  isPlatformConsole: boolean,
): Promise<ReactNode> {
  const [storedStatus, passkeyEnabled] = await Promise.all([
    runWithStaffSecuritySelfPrincipal(session.user.userId, 'app/account:security-self', () =>
      deps.staffSecurity.getStatus(),
    ),
    recoveryOnly ? Promise.resolve(false) : isIndependentAuthMethodEnabled('passkey'),
  ]);
  const status = storedStatus ?? {
    enrolled: false,
    recoveryConfirmed: false,
    replacementRequired: false,
    lockedUntil: null,
    sessionVersion: 0,
  };
  return (
    <>
      <StaffSecuritySection
        initialStatus={status}
        hasProfileName={Boolean(session.user.displayName.trim())}
        hasOrganization={workspaceContext !== null}
        hasSpecialistBinding={workspaceContext?.specialistId != null}
        showSpecialistFirstRun={!isPlatformConsole}
        recoveryOnly={recoveryOnly}
      />
      {passkeyEnabled ? <StaffPasskeySection /> : null}
    </>
  );
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
  if (isPlatformConsole && requestedTab === 'notifications') {
    redirect('/app/admin/notifications');
  }
  const recoveryOnly =
    session.staffSecurity?.assurance === 'recovery' ||
    session.staffSecurity?.assurance === 'recovery_confirmation';
  const tab = restrictedSecuritySession ? 'security' : requestedTab;
  const showAllSections = isPlatformConsole && !restrictedSecuritySession && !recoveryOnly;
  const deps = buildAppDeps();

  const showProfile = showAllSections || tab === 'profile';
  const showSecurity = showAllSections || tab === 'security';
  const showNotifications = !isPlatformConsole && tab === 'notifications';
  const showInstall = showAllSections || tab === 'install';

  const [profileContent, securityContent, notificationsContent] = await Promise.all([
    showProfile ? loadProfileContent(deps, session.user.userId, workspaceContext) : null,
    showSecurity
      ? loadSecurityContent(deps, session, workspaceContext, recoveryOnly, isPlatformConsole)
      : null,
    showNotifications
      ? loadStaffNotificationsSection(deps, session, workspaceContext)
      : null,
  ]);

  const content = (
    <>
      {profileContent}
      {securityContent}
      {notificationsContent}
      {showInstall ? <InstallSection /> : null}
    </>
  );

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
      <DoctorPageHeader
        title="Аккаунт"
        tabs={isPlatformConsole ? undefined : <AccountTabs activeTab={tab} />}
      />
      {content}
    </DoctorAppShell>
  );
}
