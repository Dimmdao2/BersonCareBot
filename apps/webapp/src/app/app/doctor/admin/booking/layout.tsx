import type { ReactNode } from "react";
import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { BookingAdminTabsNav } from "@/app/app/doctor/admin/booking/BookingAdminTabsNav";
import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctorWorkspaceLayout";

export default async function DoctorAdminBookingLayout({ children }: { children: ReactNode }) {
  await requireAdminDoctorPage();

  return (
    <div className={DOCTOR_PAGE_CONTAINER_CLASS}>
      <h1 className="text-xl font-semibold">Настройки записи</h1>
      <BookingAdminTabsNav />
      {children}
    </div>
  );
}
