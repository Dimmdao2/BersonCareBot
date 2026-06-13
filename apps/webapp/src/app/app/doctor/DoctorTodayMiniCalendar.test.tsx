/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { DoctorTodayMiniCalendar } from "./DoctorTodayMiniCalendar";
import type { TodayAppointmentItem } from "./loadDoctorTodayDashboard";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
    className?: string;
    title?: string;
    style?: React.CSSProperties;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function makeAppt(id: string, time: string, clientLabel = "Пациент"): TodayAppointmentItem {
  return {
    id,
    time,
    clientLabel,
    clientUserId: "user-1",
    type: "Сеанс",
    status: "created",
    branchName: null,
    scheduleProvenancePrefix: null,
    rubitimeNameIfDifferent: null,
    href: `/app/doctor/clients/user-1?scope=appointments`,
    ctaLabel: "Открыть",
  };
}

const DEFAULT_IANA = "Europe/Moscow";

describe("DoctorTodayMiniCalendar", () => {
  describe("empty state", () => {
    it("shows hint + link AND still renders the day timeline when no appointments (R1)", () => {
      render(
        <DoctorTodayMiniCalendar
          appointments={[]}
          nowMinutes={600}
          todayDateLabel="ср, 11 июня"
          displayIana={DEFAULT_IANA}
        />,
      );
      // R1: подсказка «нет записей», но календарь-таймлайн всё равно показан.
      expect(screen.getByText(/Записей на сегодня нет/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "открыть расписание" })).toHaveAttribute(
        "href",
        "/app/doctor/schedule?tab=calendar",
      );
      // Сетка рендерится (часовые метки видны даже без записей).
      expect(screen.getByText("09:00")).toBeInTheDocument();
    });

    it("shows heading and date label", () => {
      render(
        <DoctorTodayMiniCalendar
          appointments={[]}
          nowMinutes={600}
          todayDateLabel="пн, 9 июня"
          displayIana={DEFAULT_IANA}
        />,
      );
      expect(screen.getByRole("heading", { name: "Расписание на сегодня" })).toBeInTheDocument();
      expect(screen.getByText("пн, 9 июня")).toBeInTheDocument();
    });
  });

  describe("appointment blocks", () => {
    it("renders appointment as a link with patient name and time", () => {
      render(
        <DoctorTodayMiniCalendar
          appointments={[makeAppt("a1", "10:00", "Иванова Мария")]}
          nowMinutes={600}
          todayDateLabel="ср, 11 июня"
          displayIana={DEFAULT_IANA}
        />,
      );
      const link = screen.getByRole("link", { name: /Иванова Мария/ });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/app/doctor/clients/user-1?scope=appointments");
    });

    it("renders multiple appointments", () => {
      const appointments = [
        makeAppt("a1", "09:00", "Первый"),
        makeAppt("a2", "11:00", "Второй"),
        makeAppt("a3", "14:00", "Третий"),
      ];
      render(
        <DoctorTodayMiniCalendar
          appointments={appointments}
          nowMinutes={600}
          todayDateLabel="ср, 11 июня"
          displayIana={DEFAULT_IANA}
        />,
      );
      expect(screen.getByRole("link", { name: /Первый/ })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Второй/ })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Третий/ })).toBeInTheDocument();
    });

    it("shows hour labels in the grid", () => {
      render(
        <DoctorTodayMiniCalendar
          appointments={[makeAppt("a1", "10:00")]}
          nowMinutes={600}
          todayDateLabel="ср, 11 июня"
          displayIana={DEFAULT_IANA}
        />,
      );
      // computeRange: min=10 → start=9, max=10 → end=12, so hours 9,10,11 shown
      expect(screen.getByText("09:00")).toBeInTheDocument();
      expect(screen.getByText("10:00")).toBeInTheDocument();
    });
  });

  describe("computeRange defaults", () => {
    it("uses 09–19 default range when no appointments (grid still rendered — R1)", () => {
      render(
        <DoctorTodayMiniCalendar
          appointments={[]}
          nowMinutes={600}
          todayDateLabel="ср, 11 июня"
          displayIana={DEFAULT_IANA}
        />,
      );
      // R1: грид рендерится дефолтным окном 09–19 даже без записей.
      expect(screen.getByText("09:00")).toBeInTheDocument();
      expect(screen.getByText("18:00")).toBeInTheDocument();
    });

    it("clamps range to 07–22 boundaries", () => {
      const appointments = [
        makeAppt("early", "07:30"), // min hour=7 → startHour=max(7,7-1)=7
        makeAppt("late", "21:00"),  // max hour=21 → endHour=min(22,21+2)=22
      ];
      render(
        <DoctorTodayMiniCalendar
          appointments={appointments}
          nowMinutes={600}
          todayDateLabel="ср, 11 июня"
          displayIana={DEFAULT_IANA}
        />,
      );
      expect(screen.getByText("07:00")).toBeInTheDocument();
      expect(screen.getByText("21:00")).toBeInTheDocument();
    });
  });

  describe("now line", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("does not crash when nowMinutes is outside the displayed range", () => {
      // appointment at 10:00, range ~09–12, nowMinutes=1380 (23:00) → no red line
      expect(() =>
        render(
          <DoctorTodayMiniCalendar
            appointments={[makeAppt("a1", "10:00")]}
            nowMinutes={1380}
            todayDateLabel="ср, 11 июня"
            displayIana={DEFAULT_IANA}
          />,
        ),
      ).not.toThrow();
    });
  });

  // §1.2 — Working bounds
  describe("§1.2 workingBounds", () => {
    it("uses working hours as base window when provided (9:00–18:00)", () => {
      // Single appointment at 13:00 — without workingBounds range would be ~12–15
      // With workingBounds 9:00–18:00 (540–1080 min) range should cover 09:00 at minimum
      render(
        <DoctorTodayMiniCalendar
          appointments={[makeAppt("a1", "13:00")]}
          nowMinutes={600}
          todayDateLabel="ср, 11 июня"
          displayIana={DEFAULT_IANA}
          workingBounds={{ startMinute: 9 * 60, endMinute: 18 * 60 }}
        />,
      );
      // With workingBounds the grid should start at or before 09:00
      expect(screen.getByText("09:00")).toBeInTheDocument();
      // And extend to or past 18:00
      expect(screen.getByText("18:00")).toBeInTheDocument();
    });

    it("falls back to appointment-based range when workingBounds is null", () => {
      // Single appointment at 10:00 — null bounds → fallback to old behaviour
      render(
        <DoctorTodayMiniCalendar
          appointments={[makeAppt("a1", "10:00")]}
          nowMinutes={600}
          todayDateLabel="ср, 11 июня"
          displayIana={DEFAULT_IANA}
          workingBounds={null}
        />,
      );
      // Old behaviour: start = max(7, 10-1) = 9
      expect(screen.getByText("09:00")).toBeInTheDocument();
    });

    it("extends working hours window when appointment is before shift start", () => {
      // Appointment at 07:30, working bounds 09:00–18:00 → start should be <= 07:00
      render(
        <DoctorTodayMiniCalendar
          appointments={[makeAppt("a1", "07:30")]}
          nowMinutes={600}
          todayDateLabel="ср, 11 июня"
          displayIana={DEFAULT_IANA}
          workingBounds={{ startMinute: 9 * 60, endMinute: 18 * 60 }}
        />,
      );
      // Grid should show 07:00 (clamped to 7 at minimum)
      expect(screen.getByText("07:00")).toBeInTheDocument();
    });

    it("renders the working-day timeline when no appointments but workingBounds provided (R1)", () => {
      render(
        <DoctorTodayMiniCalendar
          appointments={[]}
          nowMinutes={600}
          todayDateLabel="ср, 11 июня"
          displayIana={DEFAULT_IANA}
          workingBounds={{ startMinute: 9 * 60, endMinute: 18 * 60 }}
        />,
      );
      // R1: грид рабочего дня показан даже без записей (плюс подсказка «нет записей»).
      expect(screen.getByText(/Записей на сегодня нет/)).toBeInTheDocument();
      expect(screen.getByText("09:00")).toBeInTheDocument();
    });
  });
});
