import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctorWorkspaceLayout";
import { DateTime } from "luxon";
import { DoctorBookingCalendarClient } from "./DoctorBookingCalendarClient";

type Props = {
  searchParams: Promise<{ view?: string; date?: string }>;
};

export default async function DoctorCalendarPage({ searchParams }: Props) {
  await requireDoctorAccess();
  const sp = await searchParams;
  const deps = buildAppDeps();
  const tzRow = await deps.systemSettings.getSetting("app_display_timezone", "admin");
  const timeZone =
    tzRow?.valueJson && typeof tzRow.valueJson === "object" && typeof (tzRow.valueJson as { value?: unknown }).value === "string"
      ? (tzRow.valueJson as { value: string }).value
      : "Europe/Moscow";
  const view = sp.view === "day" || sp.view === "month" ? sp.view : "week";
  const anchorDate =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)
      ? sp.date
      : (DateTime.now().setZone(timeZone).toISODate() ?? "2026-01-01");

  return (
    <div className={DOCTOR_PAGE_CONTAINER_CLASS}>
      <DoctorBookingCalendarClient initialAnchorDate={anchorDate} initialView={view} timeZone={timeZone} />
    </div>
  );
}
