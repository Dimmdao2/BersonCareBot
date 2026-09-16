import { redirect } from 'next/navigation';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { loadStaffNotificationsSection } from '@/app/app/account/staffNotificationsSection';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { loadStaffAccountPageContext } from './accountContext';
import {
  loadAccountEmailContent,
  loadOrganizationContent,
  loadProfileContent,
  loadSecurityContent,
  loadTariffContent,
} from './accountSections';
import { isRestrictedStaffSecuritySession } from '@/app-layer/guards/requireRole';

export default async function AccountPage() {
  const { session, workspaceContext, workspaceAccess } = await loadStaffAccountPageContext();
  const restrictedSecuritySession = isRestrictedStaffSecuritySession(session);
  const isPlatformConsole = session.user.role === 'admin';
  if (isPlatformConsole) redirect('/app/admin');
  const recoveryOnly =
    session.staffSecurity?.assurance === 'recovery' ||
    session.staffSecurity?.assurance === 'recovery_confirmation';

  const deps = buildAppDeps();

  const [
    accountEmailContent,
    profileContent,
    organizationContent,
    securityContent,
    notificationsContent,
  ] = await Promise.all([
    restrictedSecuritySession ? null : loadAccountEmailContent(deps, session.user.userId),
    restrictedSecuritySession
      ? null
      : loadProfileContent(deps, workspaceContext, {
          hideSoloOnlyToggles: workspaceContext?.canManageOrganization === true,
        }),
    restrictedSecuritySession
      ? null
      : loadOrganizationContent(deps, session.user.userId, workspaceContext),
    loadSecurityContent(deps, session, workspaceContext, recoveryOnly, isPlatformConsole),
    restrictedSecuritySession
      ? null
      : loadStaffNotificationsSection(deps, session, workspaceAccess),
  ]);
  // Биллинг временно сужает DB-роль до администратора организации, поэтому его чтения не идут
  // параллельно с остальными разделами страницы.
  const tariffContent = restrictedSecuritySession
    ? null
    : await loadTariffContent(deps, session.user.userId, workspaceAccess);

  const content = restrictedSecuritySession ? (
    securityContent
  ) : (
    <div
      data-account-layout
      className="grid min-w-0 items-start gap-3 pb-[var(--doctor-page-bottom-gutter,18px)] xl:grid-cols-2"
    >
      <div data-account-column="profile" className="flex min-w-0 flex-col gap-3">
        {profileContent}
        {organizationContent}
        <div id="tariff" className="flex min-w-0 scroll-mt-3 flex-col gap-3">
          {tariffContent}
        </div>
      </div>
      <div data-account-column="security" className="flex min-w-0 flex-col gap-3">
        {accountEmailContent}
        {securityContent}
        {notificationsContent}
      </div>
    </div>
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
      <DoctorPageHeader title="Аккаунт" />
      {content}
    </DoctorAppShell>
  );
}
