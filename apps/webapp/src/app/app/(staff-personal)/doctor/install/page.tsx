import '../../../../styles/doctor.css';
import { redirect } from 'next/navigation';
import { requireStaffPersonalInstallPage } from '@/app-layer/guards/requireRole';
import { staffPwaLayoutMetadata } from '@/shared/lib/pwa/staffPwaLayoutMetadata';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { DoctorWorkspaceShell } from '@/shared/ui/doctor/shell/DoctorWorkspaceShell';
import { DoctorSection } from '@/shared/ui/doctor/DoctorSection';
import { StaffPwaInstallSection } from '@/shared/ui/doctor/pwa/StaffPwaInstallSection';

export const metadata = staffPwaLayoutMetadata;

/** Personal-only install entry; it intentionally sits outside the clinical `/app/doctor` layout. */
export default async function DoctorInstallPage() {
  const session = await requireStaffPersonalInstallPage();
  const isPlatformOperator = session.user.role === 'admin';
  if (!isPlatformOperator) {
    redirect('/app/account?tab=install');
  }

  return (
    <DoctorWorkspaceShell
      isPlatformOperator={isPlatformOperator}
      enableTenantRuntime={false}
      userDisplayName={session.user.displayName}
      userRole={session.user.role}
    >
      <DoctorAppShell title="Установить приложение" user={session.user}>
        <DoctorPageHeader title="Установить приложение" />
        <DoctorSection>
          <StaffPwaInstallSection />
        </DoctorSection>
      </DoctorAppShell>
    </DoctorWorkspaceShell>
  );
}
