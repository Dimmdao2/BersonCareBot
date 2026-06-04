import type { ReactNode } from "react";
import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { BookingAdminTabsNav } from "@/app/app/doctor/admin/booking/BookingAdminTabsNav";
import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";
import { doctorPageTitleClass } from "@/shared/ui/doctor/doctorVisual";

export default async function DoctorAdminBookingLayout({ children }: { children: ReactNode }) {
  await requireAdminDoctorPage();

  return (
    <div className={DOCTOR_PAGE_CONTAINER_CLASS}>
      <h1 className={doctorPageTitleClass}>Настройки записи</h1>
      <BookingAdminTabsNav />
      {children}
    </div>
  );
}
