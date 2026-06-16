"use client";

import { useState } from "react";
import { DoctorTodayMiniCalendar } from "./DoctorTodayMiniCalendar";
import { TodayAppointmentModal } from "./TodayAppointmentModal";
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
  const [selectedAppt, setSelectedAppt] = useState<TodayAppointmentItem | null>(null);

  return (
    <>
      <DoctorTodayMiniCalendar
        appointments={appointments}
        nowMinutes={nowMinutes}
        todayDateLabel={todayDateLabel}
        displayIana={displayIana}
        workingBounds={workingBounds}
        onEventClick={setSelectedAppt}
      />
      <TodayAppointmentModal
        appt={selectedAppt}
        onClose={() => setSelectedAppt(null)}
      />
    </>
  );
}
