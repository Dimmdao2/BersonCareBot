import { redirect } from 'next/navigation';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { loadStaffNotificationsSection } from '@/app/app/account/staffNotificationsSection';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { AccountTabs, type AccountTab } from './AccountTabs';
import { loadStaffAccountPageContext } from './accountContext';
import { loadProfileContent, loadSecurityContent } from './accountSections';
import { isRestrictedStaffSecuritySession } from '@/app-layer/guards/requireRole';

function parseTab(raw: string | string[] | undefined): AccountTab {
  const value = typeof raw === 'string' ? raw : raw?.[0];
  return value === 'security' || value === 'notifications' ? value : 'account';
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string | string[] }>;
}) {
  const sp = searchParams != null ? await searchParams : {};
  const requestedTab = parseTab(sp.tab);
  const { session, workspaceContext, workspaceAccess } = await loadStaffAccountPageContext();
  const restrictedSecuritySession = isRestrictedStaffSecuritySession(session);
  const isPlatformConsole = session.user.role === 'admin';
  if (isPlatformConsole) redirect('/app/admin');
  const recoveryOnly =
    session.staffSecurity?.assurance === 'recovery' ||
    session.staffSecurity?.assurance === 'recovery_confirmation';
  const tab = restrictedSecuritySession ? 'security' : requestedTab;

  const deps = buildAppDeps();

  const showProfile = tab === 'account';
  const showSecurity = tab === 'security';
  const showNotifications = tab === 'notifications';

  const [profileContent, securityContent, notificationsContent] = await Promise.all([
    showProfile
      ? loadProfileContent(deps, session.user.userId, workspaceContext, {
          hideSoloOnlyToggles: workspaceContext?.canManageOrganization === true,
        })
      : null,
    showSecurity
      ? loadSecurityContent(deps, session, workspaceContext, recoveryOnly, isPlatformConsole)
      : null,
    showNotifications ? loadStaffNotificationsSection(deps, session, workspaceAccess) : null,
  ]);

  const content = (
    <>
      {profileContent}
      {securityContent}
      {notificationsContent}
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
      <DoctorPageHeader title="Аккаунт" tabs={<AccountTabs activeTab={tab} />} />
      {content}
    </DoctorAppShell>
  );
}
