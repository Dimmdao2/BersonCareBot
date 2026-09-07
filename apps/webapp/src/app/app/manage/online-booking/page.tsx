import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { ManagementBookingSections } from '../ManagementBookingSections';

/** Reuses the canonical booking writers under the management-only navigation registry. */
export default function ManagementOnlineBookingPage() {
  return (
    <>
      <DoctorPageHeader title="Онлайн-запись" />
      <ManagementBookingSections defaultSection="form" basePath="/app/manage/online-booking" />
    </>
  );
}
