import type { ReactNode } from "react";
import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { BookingAdminTabsNav } from "@/app/app/doctor/admin/booking/BookingAdminTabsNav";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";

export default async function DoctorAdminBookingLayout({ children }: { children: ReactNode }) {
  await requireAdminDoctorPage();

  return (
    <DoctorAppShell title="Настройки записи">
      <DoctorPageHeader title="Настройки записи" tabs={<BookingAdminTabsNav />} />
      {children}
    </DoctorAppShell>
  );
}
