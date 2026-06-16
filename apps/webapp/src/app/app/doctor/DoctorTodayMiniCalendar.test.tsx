/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { DoctorTodayMiniCalendar } from "./DoctorTodayMiniCalendar";
import type { TodayAppointmentItem } from "./loadDoctorTodayDashboard";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// FullCalendar — тяжёлый, мокаем stub (аналогично ScheduleCalendarTab.test.tsx)
vi.mock("@fullcalendar/react", () => ({
  default: ({ events }: { events?: Array<{ title?: string }> }) => (
    <div data-testid="fullcalendar">
      {(events ?? []).map((e, i) => (
        <div key={i} data-testid="fc-event">
          {e.title}
        </div>
      ))}
    </div>
  ),
}));
vi.mock("@fullcalendar/timegrid", () => ({ default: {} }));
vi.mock("@fullcalendar/interaction", () => ({ default: {} }));
vi.mock("@fullcalendar/core/locales/ru", () => ({ default: {} }));

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAppt(id: string, time: string, clientLabel = "Пациент"): TodayAppointmentItem {
  return {
    id,
    time,
    recordAtIso: null,
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DoctorTodayMiniCalendar", () => {
  describe("section structure", () => {
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

    it("renders FullCalendar component", () => {
      render(
        <DoctorTodayMiniCalendar
          appointments={[]}
          nowMinutes={600}
          todayDateLabel="ср, 11 июня"
          displayIana={DEFAULT_IANA}
        />,
      );
      expect(screen.getByTestId("fullcalendar")).toBeInTheDocument();
    });
  });

  describe("empty state (R1)", () => {
    it("shows hint + link AND still renders the calendar when no appointments", () => {
      render(
        <DoctorTodayMiniCalendar
          appointments={[]}
          nowMinutes={600}
          todayDateLabel="ср, 11 июня"
          displayIana={DEFAULT_IANA}
        />,
      );
      // R1: подсказка «нет записей»
      expect(screen.getByText(/Записей на сегодня нет/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "открыть расписание" })).toHaveAttribute(
        "href",
        "/app/doctor/schedule?tab=calendar",
      );
      // Календарь всё равно показан
      expect(screen.getByTestId("fullcalendar")).toBeInTheDocument();
    });

    it("does NOT show the empty-state hint when appointments exist", () => {
      render(
        <DoctorTodayMiniCalendar
          appointments={[makeAppt("a1", "10:00", "Иванова")]}
          nowMinutes={600}
          todayDateLabel="ср, 11 июня"
          displayIana={DEFAULT_IANA}
        />,
      );
      expect(screen.queryByText(/Записей на сегодня нет/)).not.toBeInTheDocument();
    });
  });

  describe("appointment rendering", () => {
    it("renders appointment title in FC and in sr-only list with link", () => {
      render(
        <DoctorTodayMiniCalendar
          appointments={[makeAppt("a1", "10:00", "Иванова Мария")]}
          nowMinutes={600}
          todayDateLabel="ср, 11 июня"
          displayIana={DEFAULT_IANA}
        />,
      );
      // sr-only list link
      const link = screen.getByRole("link", { name: "Иванова Мария" });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/app/doctor/clients/user-1?scope=appointments");
      // FC mock renders event title
      expect(screen.getByTestId("fc-event")).toHaveTextContent("Иванова Мария");
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
      // sr-only links
      expect(screen.getByRole("link", { name: "Первый" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Второй" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Третий" })).toBeInTheDocument();
      // FC mock events
      const fcEvents = screen.getAllByTestId("fc-event");
      expect(fcEvents).toHaveLength(3);
    });
  });

  describe("nowMinutes backward compatibility", () => {
    it("does not crash when nowMinutes is passed (ignored — FC draws now-indicator)", () => {
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
    it("renders calendar without crash when workingBounds provided", () => {
      render(
        <DoctorTodayMiniCalendar
          appointments={[makeAppt("a1", "13:00")]}
          nowMinutes={600}
          todayDateLabel="ср, 11 июня"
          displayIana={DEFAULT_IANA}
          workingBounds={{ startMinute: 9 * 60, endMinute: 18 * 60 }}
        />,
      );
      expect(screen.getByTestId("fullcalendar")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Расписание на сегодня" })).toBeInTheDocument();
    });

    it("renders calendar without crash when workingBounds is null", () => {
      render(
        <DoctorTodayMiniCalendar
          appointments={[makeAppt("a1", "10:00")]}
          nowMinutes={600}
          todayDateLabel="ср, 11 июня"
          displayIana={DEFAULT_IANA}
          workingBounds={null}
        />,
      );
      expect(screen.getByTestId("fullcalendar")).toBeInTheDocument();
    });

    it("renders the day calendar when no appointments but workingBounds provided (R1)", () => {
      render(
        <DoctorTodayMiniCalendar
          appointments={[]}
          nowMinutes={600}
          todayDateLabel="ср, 11 июня"
          displayIana={DEFAULT_IANA}
          workingBounds={{ startMinute: 9 * 60, endMinute: 18 * 60 }}
        />,
      );
      // R1: календарь показан + подсказка «нет записей»
      expect(screen.getByText(/Записей на сегодня нет/)).toBeInTheDocument();
      expect(screen.getByTestId("fullcalendar")).toBeInTheDocument();
    });

    it("renders calendar without crash for early appointment outside shift bounds", () => {
      // Appointment at 07:30, working bounds 09:00–18:00
      render(
        <DoctorTodayMiniCalendar
          appointments={[makeAppt("a1", "07:30")]}
          nowMinutes={600}
          todayDateLabel="ср, 11 июня"
          displayIana={DEFAULT_IANA}
          workingBounds={{ startMinute: 9 * 60, endMinute: 18 * 60 }}
        />,
      );
      expect(screen.getByTestId("fullcalendar")).toBeInTheDocument();
      // Appointment is in sr-only list
      expect(screen.getByRole("link", { name: "Пациент" })).toBeInTheDocument();
    });
  });
});
