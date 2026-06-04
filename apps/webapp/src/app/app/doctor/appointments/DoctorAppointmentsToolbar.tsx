"use client";

import Link from "next/link";
import { DoctorCreateAppointmentDialog } from "./DoctorCreateAppointmentDialog";

type Props = {
  tab: "appointments" | "schedule";
  isAdmin: boolean;
};

const tabLinkClass =
  "text-sm px-3 py-1.5 rounded-md transition-colors";
const tabActiveCls = "bg-accent text-accent-foreground font-medium";
const tabInactiveCls = "text-muted-foreground hover:text-foreground";

export function DoctorAppointmentsToolbar({ tab, isAdmin }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1">
        <Link
          href="?tab=appointments"
          className={`${tabLinkClass} ${tab === "appointments" ? tabActiveCls : tabInactiveCls}`}
        >
          Записи
        </Link>
        {isAdmin ? (
          <Link
            href="?tab=schedule"
            className={`${tabLinkClass} ${tab === "schedule" ? tabActiveCls : tabInactiveCls}`}
          >
            Расписание
          </Link>
        ) : null}
      </div>
      <DoctorCreateAppointmentDialog />
    </div>
  );
}
