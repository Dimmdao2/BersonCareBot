import { requireDoctorAccess } from '@/app-layer/guards/requireRole';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { MediaLibraryClient } from './MediaLibraryClient';

export default async function DoctorContentLibraryPage() {
  const session = await requireDoctorAccess();

  return (
    <DoctorAppShell
      title="Библиотека файлов"
      backHref="/app/doctor/content"
      user={session.user}
      layout="full-height"
    >
      <DoctorPageHeader title="Библиотека файлов" />
      <MediaLibraryClient canSeeDeleteErrorsLink={session.user.role === 'admin'} />
    </DoctorAppShell>
  );
}
