import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { ManagementBookingSections } from './ManagementBookingSections';

export default async function ManagementPage() {
  return (
    <>
      <DoctorPageHeader title="Управление клиникой" />
      <ManagementBookingSections />
    </>
  );
}
