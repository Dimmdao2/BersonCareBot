"use client";

import { useState } from "react";
import { DateTime } from "luxon";
import { DoctorTodayMiniCalendar } from "./DoctorTodayMiniCalendar";
import { TodayAppointmentFullModal } from "./TodayAppointmentFullModal";
import type { TodayAppointmentItem } from "./loadDoctorTodayDashboard";

type Props = {
  appointments: TodayAppointmentItem[];
  nowMinutes?: number;
  todayDateLabel: string;
  displayIana: string;
  workingBounds?: { startMinute: number; endMinute: number } | null;
};

export function TodayMiniCalendarWithModal({
  appointments,
  nowMinutes,
  todayDateLabel,
  displayIana,
  workingBounds,
}: Props) {
  const [selectedApptId, setSelectedApptId] = useState<string | null>(null);

  const todayIso =
    DateTime.now().setZone(displayIana).toISODate() ??
    new Date().toISOString().slice(0, 10);

  return (
    <>
      <DoctorTodayMiniCalendar
        appointments={appointments}
        nowMinutes={nowMinutes}
        todayDateLabel={todayDateLabel}
        displayIana={displayIana}
        workingBounds={workingBounds}
        onEventClick={(appt) => setSelectedApptId(appt.id)}
      />
      <TodayAppointmentFullModal
        apptId={selectedApptId}
        todayIso={todayIso}
        displayIana={displayIana}
        onClose={() => setSelectedApptId(null)}
      />
    </>
  );
}
