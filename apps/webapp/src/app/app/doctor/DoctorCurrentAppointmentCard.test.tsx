/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { DoctorCurrentAppointmentCard } from "./DoctorCurrentAppointmentCard";
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
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function makeAppt(overrides: Partial<TodayAppointmentItem> = {}): TodayAppointmentItem {
  return {
    id: "appt-1",
    time: "10:00",
    clientLabel: "Иванова Мария",
    clientUserId: "user-1",
    type: "Сеанс",
    status: "created",
    branchName: null,
    scheduleProvenancePrefix: null,
    rubitimeNameIfDifferent: null,
    href: "/app/doctor/clients/user-1?scope=appointments",
    ctaLabel: "Открыть карточку",
    ...overrides,
  };
}

describe("DoctorCurrentAppointmentCard", () => {
  describe("empty states", () => {
    it("shows empty state when no appointments", () => {
      render(<DoctorCurrentAppointmentCard appointments={[]} nowMinutes={600} />);
      expect(screen.getByText("На сегодня записей нет")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Открыть расписание" })).toHaveAttribute(
        "href",
        "/app/doctor/schedule?tab=calendar",
      );
    });

    it('shows "все завершены" when appointments exist but all are in the past', () => {
      // nowMinutes=1200 (20:00), appointment at 09:00, duration 90 min → ends at 10:30
      render(
        <DoctorCurrentAppointmentCard
          appointments={[makeAppt({ time: "09:00" })]}
          nowMinutes={1200}
        />,
      );
      expect(screen.getByText("Все записи на сегодня завершены")).toBeInTheDocument();
    });
  });

  describe("ongoing appointment (current)", () => {
    it('shows "Сейчас на приёме" heading when appointment is ongoing', () => {
      // appointment at 10:00, nowMinutes=660 (11:00) → within 10:00–11:30 window (90 min)
      render(
        <DoctorCurrentAppointmentCard
          appointments={[makeAppt({ time: "10:00" })]}
          nowMinutes={660}
        />,
      );
      expect(screen.getByRole("heading", { name: "Сейчас на приёме" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Иванова Мария" })).toHaveAttribute(
        "href",
        "/app/doctor/clients/user-1?scope=appointments",
      );
      expect(screen.getByText(/10:00 · Сеанс/)).toBeInTheDocument();
    });

    it("shows CTA button for ongoing appointment with clientUserId", () => {
      render(
        <DoctorCurrentAppointmentCard
          appointments={[makeAppt({ time: "10:00" })]}
          nowMinutes={660}
        />,
      );
      expect(screen.getByRole("link", { name: "Открыть карточку пациента" })).toHaveAttribute(
        "href",
        "/app/doctor/clients/user-1?scope=appointments",
      );
    });

    it("shows next-after-current line when there is an appointment after the ongoing one", () => {
      const appointments = [
        makeAppt({ id: "a1", time: "10:00", clientLabel: "Первый" }),
        makeAppt({ id: "a2", time: "12:00", clientLabel: "Второй" }),
      ];
      // nowMinutes=660 (11:00) → a1 is ongoing (10:00–11:30), a2 is next
      render(<DoctorCurrentAppointmentCard appointments={appointments} nowMinutes={660} />);
      expect(screen.getByRole("heading", { name: "Сейчас на приёме" })).toBeInTheDocument();
      expect(screen.getByText(/Следующий: 12:00 · Второй/)).toBeInTheDocument();
    });
  });

  describe("next appointment", () => {
    it('shows "Следующая запись" heading when no appointment is ongoing', () => {
      // appointment at 14:00, nowMinutes=720 (12:00) → not yet started
      render(
        <DoctorCurrentAppointmentCard
          appointments={[makeAppt({ time: "14:00", clientLabel: "Петров Иван" })]}
          nowMinutes={720}
        />,
      );
      expect(screen.getByRole("heading", { name: "Следующая запись" })).toBeInTheDocument();
      expect(screen.getByText("Петров Иван")).toBeInTheDocument();
      expect(screen.getByText(/14:00/)).toBeInTheDocument();
    });

    it("picks the nearest future appointment as next", () => {
      const appointments = [
        makeAppt({ id: "a1", time: "08:00", clientLabel: "Прошлый" }),
        makeAppt({ id: "a2", time: "15:00", clientLabel: "Следующий" }),
        makeAppt({ id: "a3", time: "17:00", clientLabel: "Послезавтра" }),
      ];
      // nowMinutes=780 (13:00) — a1 ended (08:00+90=9:30), a2 is next
      render(<DoctorCurrentAppointmentCard appointments={appointments} nowMinutes={780} />);
      expect(screen.getByRole("heading", { name: "Следующая запись" })).toBeInTheDocument();
      expect(screen.getByText("Следующий")).toBeInTheDocument();
    });

    it("renders status and branchName when provided", () => {
      render(
        <DoctorCurrentAppointmentCard
          appointments={[makeAppt({ time: "14:00", status: "confirmed", branchName: "СПб" })]}
          nowMinutes={600}
        />,
      );
      expect(screen.getByText(/confirmed · СПб/)).toBeInTheDocument();
    });

    it("does not show CTA button when clientUserId is absent", () => {
      render(
        <DoctorCurrentAppointmentCard
          appointments={[makeAppt({ time: "14:00", clientUserId: null })]}
          nowMinutes={600}
        />,
      );
      expect(screen.queryByRole("link", { name: "Открыть карточку пациента" })).not.toBeInTheDocument();
    });
  });
});
