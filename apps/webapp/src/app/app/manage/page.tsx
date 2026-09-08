import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { ManagementBookingSections } from './ManagementBookingSections';

export default async function ManagementPage() {
  return (
    <DoctorAppShell title="Управление клиникой" layout="full-height">
      <DoctorPageHeader title="Управление клиникой" />
      <ManagementBookingSections />
    </DoctorAppShell>
  );
}
