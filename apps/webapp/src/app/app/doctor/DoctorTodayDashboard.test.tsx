/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DoctorTodayDashboard } from "./DoctorTodayDashboard";
import type { TodayDashboardData } from "./loadDoctorTodayDashboard";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    id?: string;
    className?: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function emptyData(): TodayDashboardData {
  return {
    todayAppointments: [],
    newIntakeRequests: [],
    unreadConversations: [],
    unreadTotal: 0,
    upcomingAppointments: [],
    onSupportCount: 0,
    onSupportClients: [],
    onSupportListTruncated: false,
  };
}

describe("DoctorTodayDashboard", () => {
  it("renders title, stats link, and section headings", () => {
    render(<DoctorTodayDashboard data={emptyData()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Сегодня" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть статистику" })).toHaveAttribute(
      "href",
      "/app/doctor/stats",
    );
    expect(screen.getByRole("heading", { name: "На сопровождении" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Записи сегодня" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Новые онлайн-заявки" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Непрочитанные сообщения" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ближайшие записи" })).toBeInTheDocument();
  });

  it("shows empty states and CTAs", () => {
    render(<DoctorTodayDashboard data={emptyData()} />);
    expect(screen.getByText("Клиентов на сопровождении нет")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Список клиентов" })).toHaveAttribute(
      "href",
      "/app/doctor/clients?scope=all&treatmentProgram=1",
    );
    expect(screen.getByText("На сегодня записей нет")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть записи" })).toHaveAttribute(
      "href",
      "/app/doctor/appointments",
    );
    expect(screen.getByText("Новых заявок нет")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть все заявки" })).toHaveAttribute(
      "href",
      "/app/doctor/online-intake",
    );
    expect(screen.getByText("Непрочитанных сообщений нет")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть все сообщения" })).toHaveAttribute(
      "href",
      "/app/doctor/messages",
    );
    expect(screen.getByText("Ближайших записей на неделе нет")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Все записи" })[0]).toHaveAttribute(
      "href",
      "/app/doctor/appointments?view=future",
    );
  });

  it("renders today appointment with card link", () => {
    const data: TodayDashboardData = {
      ...emptyData(),
      todayAppointments: [
        {
          id: "ap1",
          time: "09:00",
          clientLabel: "Клиент",
          clientUserId: "user-1",
          type: "Осмотр",
          status: "created",
          branchName: "Филиал А",
          scheduleProvenancePrefix: "Rubitime",
          rubitimeNameIfDifferent: null,
          href: "/app/doctor/clients/user-1",
          ctaLabel: "Открыть карточку",
        },
      ],
    };
    render(<DoctorTodayDashboard data={data} />);
    expect(screen.getByText(/09:00 · Клиент/)).toBeInTheDocument();
    expect(screen.getByText(/Осмотр · created/)).toBeInTheDocument();
    expect(screen.getByText(/Филиал А/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть карточку" })).toHaveAttribute(
      "href",
      "/app/doctor/clients/user-1",
    );
  });

  it("renders Rubitime name hint when different from profile label", () => {
    const data: TodayDashboardData = {
      ...emptyData(),
      todayAppointments: [
        {
          id: "ap2",
          time: "10:00",
          clientLabel: "Иван",
          rubitimeNameIfDifferent: "Иванов И.И.",
          clientUserId: "user-2",
          type: "Осмотр",
          status: "created",
          branchName: null,
          scheduleProvenancePrefix: null,
          href: "/app/doctor/clients/user-2",
          ctaLabel: "Открыть карточку",
        },
      ],
    };
    render(<DoctorTodayDashboard data={data} />);
    expect(screen.getByText("В Rubitime: Иванов И.И.")).toBeInTheDocument();
  });

  it("renders intake row with deep link", () => {
    const data: TodayDashboardData = {
      ...emptyData(),
      newIntakeRequests: [
        {
          id: "int1",
          patientName: "Анна",
          patientPhone: "+7000",
          typeLabel: "ЛФК",
          summary: "Текст",
          summaryPreview: "Текст",
          createdAtLabel: "02.05.2026",
          href: "/app/doctor/online-intake/int1",
        },
      ],
    };
    render(<DoctorTodayDashboard data={data} />);
    expect(screen.getByText("Анна")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть заявку" })).toHaveAttribute(
      "href",
      "/app/doctor/online-intake/int1",
    );
  });

  it("renders on-support clients and truncated footer", () => {
    const data: TodayDashboardData = {
      ...emptyData(),
      onSupportCount: 2,
      onSupportClients: [
        { userId: "u-a", displayName: "Анна", href: "/app/doctor/clients/u-a/treatment-programs/p-1" },
        { userId: "u-b", displayName: "Борис", href: "/app/doctor/clients/u-b/treatment-programs/p-2" },
      ],
      onSupportListTruncated: true,
    };
    render(<DoctorTodayDashboard data={data} />);
    expect(screen.getByText(/Клиентов: 2/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Анна" })).toHaveAttribute(
      "href",
      "/app/doctor/clients/u-a/treatment-programs/p-1",
    );
    expect(screen.getByRole("link", { name: "Борис" })).toHaveAttribute(
      "href",
      "/app/doctor/clients/u-b/treatment-programs/p-2",
    );
    expect(screen.getByRole("link", { name: "Все на сопровождении" })).toHaveAttribute(
      "href",
      "/app/doctor/clients?scope=all&treatmentProgram=1",
    );
  });

  it("renders unread conversations and total", () => {
    const data: TodayDashboardData = {
      ...emptyData(),
      unreadTotal: 5,
      unreadConversations: [
        {
          conversationId: "c1",
          displayName: "Пациент",
          phoneNormalized: "+7999",
          lastMessageAtLabel: "02.05",
          lastMessageText: "Привет",
          lastMessagePreview: "Привет",
          unreadFromUserCount: 2,
          href: "/app/doctor/messages",
        },
      ],
    };
    render(<DoctorTodayDashboard data={data} />);
    expect(screen.getByText(/Всего непрочитанных: 5/)).toBeInTheDocument();
    expect(screen.getByText("Пациент")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
