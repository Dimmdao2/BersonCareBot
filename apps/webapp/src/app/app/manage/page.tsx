import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { ManagementBookingSections } from './ManagementBookingSections';

export default async function ManagementPage() {
  return (
    <DoctorAppShell title="Управление организацией" layout="full-height">
      <DoctorPageHeader title="Управление организацией" />
      <ManagementBookingSections />
    </DoctorAppShell>
  );
}
