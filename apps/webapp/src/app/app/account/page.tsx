import { redirect } from 'next/navigation';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { loadStaffNotificationsSection } from '@/app/app/account/staffNotificationsSection';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { routePaths } from '@/app-layer/routes/paths';
import { AccountTabs, type AccountTab } from './AccountTabs';
import { loadStaffAccountPageContext } from './accountContext';
import { InstallSection, loadProfileContent, loadSecurityContent } from './accountSections';
import { isRestrictedStaffSecuritySession } from '@/app-layer/guards/requireRole';

/** Куда уходит личная вкладка, когда у человека есть «Профиль и настройки». */
const ACCOUNT_TAB_IN_SETTINGS: Record<AccountTab, string> = {
  profile: 'account',
  security: 'account',
  notifications: 'notifications',
  install: 'workspace',
};

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
  const { session, workspaceContext, workspaceAccess } = await loadStaffAccountPageContext();
  const restrictedSecuritySession = isRestrictedStaffSecuritySession(session);
  const isPlatformConsole = session.user.role === 'admin';
  if (isPlatformConsole) redirect('/app/admin');
  const recoveryOnly =
    session.staffSecurity?.assurance === 'recovery' ||
    session.staffSecurity?.assurance === 'recovery_confirmation';
  const tab = restrictedSecuritySession ? 'security' : requestedTab;

  /**
   * У кого есть право управлять организацией, у того личные разделы теперь живут вкладками
   * «Профиля и настроек» (владелец 15.09.2026: «перенести ВСЕ настройки для СОЛО в блок аккаунта…
   * все в одно место»). Отдельная страница остаётся персоналу клиники БЕЗ этого права — им в
   * настройки организации нельзя, и второго места у них не появляется.
   *
   * Сеанс восстановления и урезанный сеанс сюда не попадают: там экран нарочно сведён к самому
   * восстановлению, и уводить человека в настройки посреди него нельзя.
   */
  if (!recoveryOnly && !restrictedSecuritySession && workspaceContext?.canManageOrganization) {
    redirect(`${routePaths.settings}?tab=${ACCOUNT_TAB_IN_SETTINGS[tab]}`);
  }

  const deps = buildAppDeps();

  const showProfile = tab === 'profile';
  const showSecurity = tab === 'security';
  const showNotifications = tab === 'notifications';
  const showInstall = tab === 'install';

  const [profileContent, securityContent, notificationsContent] = await Promise.all([
    showProfile ? loadProfileContent(deps, session.user.userId, workspaceContext) : null,
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
