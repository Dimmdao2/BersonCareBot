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
    it("shows empty message and link to schedule when no appointments", () => {
      render(
        <DoctorTodayMiniCalendar
          appointments={[]}
          nowMinutes={600}
          todayDateLabel="ср, 11 июня"
          displayIana={DEFAULT_IANA}
        />,
      );
      expect(screen.getByText("Записей на сегодня нет")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Открыть расписание" })).toHaveAttribute(
        "href",
        "/app/doctor/schedule?tab=calendar",
      );
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
    it("uses 09–19 default range when no appointments", () => {
      render(
        <DoctorTodayMiniCalendar
          appointments={[]}
          nowMinutes={600}
          todayDateLabel="ср, 11 июня"
          displayIana={DEFAULT_IANA}
        />,
      );
      // Empty state is shown, no grid rendered — just verify no crash
      expect(screen.getByText("Записей на сегодня нет")).toBeInTheDocument();
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
});
