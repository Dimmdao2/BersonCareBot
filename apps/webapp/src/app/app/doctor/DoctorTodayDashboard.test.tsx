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
    globalOpenTasks: [],
    pendingProgramTests: [],
    pendingProgramTestsTotal: 0,
    pendingProgramTestsTruncated: false,
    proactiveInsights: [],
    proactiveInsightsTotal: 0,
    proactiveInsightsTruncated: false,
  };
}

const emptyKpi = {
  appointments: {
    pastVisitsInPeriod: 0,
    cancelledVisitsInPeriod: 0,
    bookingsCreatedInPeriod: 0,
    cancellationActionsInPeriod: 0,
    rescheduleActionsInPeriod: 0,
    total: 0,
    cancellations30d: 0,
  },
  clients: {
    total: 0,
    phoneOnly: 0,
    appGuests: 0,
    contactBreakdown: {
      total: 0,
      phoneOnly: 0,
      appGuests: 0,
      pie: {
        telegram_only: 0,
        max_only: 0,
        email_only: 0,
        telegram_email: 0,
        max_email: 0,
        phone_email_no_messenger: 0,
      },
    },
    newClients7dWithNoChannels: 0,
  },
};

describe("DoctorTodayDashboard", () => {
  it("renders title, KPI, attention block, and section headings", () => {
    render(
      <DoctorTodayDashboard
        data={emptyData()}
        kpiStats={emptyKpi}
        appointmentsTodayCount={0}
        showAnalyticsLink
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Сегодня" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Аналитика по клиентам" })).toHaveAttribute(
      "href",
      "/app/doctor/analytics/clients",
    );
    expect(screen.getByRole("heading", { name: "Требует внимания" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "На сопровождении" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Записи сегодня" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Новые онлайн-заявки" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Непрочитанные сообщения" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ближайшие записи" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "К проверке" })).toBeInTheDocument();
    expect(screen.getByText("Новые клиенты за 7 дн. без каналов связи")).toBeInTheDocument();
  });

  it("shows empty states and CTAs", () => {
    render(
      <DoctorTodayDashboard data={emptyData()} kpiStats={emptyKpi} appointmentsTodayCount={0} />,
    );
    expect(screen.getByText("Клиентов на сопровождении нет")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Список клиентов" })).toHaveAttribute(
      "href",
      "/app/doctor/clients?scope=all&support=on",
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
    expect(screen.getByText("Нет тестов, ожидающих оценки")).toBeInTheDocument();
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
          href: "/app/doctor/clients/user-1?scope=appointments",
          ctaLabel: "Открыть карточку",
        },
      ],
    };
    render(
      <DoctorTodayDashboard data={data} kpiStats={emptyKpi} appointmentsTodayCount={1} />,
    );
    expect(screen.getByText(/09:00 · Клиент/)).toBeInTheDocument();
    expect(screen.getByText(/Осмотр · created/)).toBeInTheDocument();
    expect(screen.getByText(/Филиал А/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть карточку" })).toHaveAttribute(
      "href",
      "/app/doctor/clients/user-1?scope=appointments",
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
          href: "/app/doctor/clients/user-2?scope=appointments",
          ctaLabel: "Открыть карточку",
        },
      ],
    };
    render(
      <DoctorTodayDashboard data={data} kpiStats={emptyKpi} appointmentsTodayCount={1} />,
    );
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
    render(
      <DoctorTodayDashboard data={data} kpiStats={emptyKpi} appointmentsTodayCount={0} />,
    );
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
        {
          userId: "u-a",
          displayName: "Анна",
          href: "/app/doctor/clients/u-a?scope=appointments#doctor-client-section-treatment-programs",
        },
        {
          userId: "u-b",
          displayName: "Борис",
          href: "/app/doctor/clients/u-b?scope=appointments#doctor-client-section-treatment-programs",
        },
      ],
      onSupportListTruncated: true,
    };
    render(
      <DoctorTodayDashboard data={data} kpiStats={emptyKpi} appointmentsTodayCount={0} />,
    );
    expect(screen.getByText(/Клиентов: 2/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Анна" })).toHaveAttribute(
      "href",
      "/app/doctor/clients/u-a?scope=appointments#doctor-client-section-treatment-programs",
    );
    expect(screen.getByRole("link", { name: "Борис" })).toHaveAttribute(
      "href",
      "/app/doctor/clients/u-b?scope=appointments#doctor-client-section-treatment-programs",
    );
    expect(screen.getByRole("link", { name: "Все на сопровождении" })).toHaveAttribute(
      "href",
      "/app/doctor/clients?scope=all&support=on",
    );
  });

  it("renders pending program tests with evaluate link and truncation footer", () => {
    const data: TodayDashboardData = {
      ...emptyData(),
      pendingProgramTestsTotal: 12,
      pendingProgramTestsTruncated: true,
      pendingProgramTests: [
        {
          attemptId: "00000000-0000-4000-8000-000000000011",
          patientUserId: "00000000-0000-4000-8000-000000000001",
          patientDisplayName: "Иванова",
          instanceId: "00000000-0000-4000-8000-000000000021",
          instanceTitle: "Программа А",
          stageTitle: "Этап 1",
          pendingCount: 2,
          submittedAtLabel: "02.06.2026, 10:00",
          href: "/app/doctor/clients/u1?scope=appointments#doctor-client-section-pending-program-tests",
        },
      ],
    };
    render(
      <DoctorTodayDashboard data={data} kpiStats={emptyKpi} appointmentsTodayCount={0} />,
    );
    expect(screen.getByText(/Попыток без оценки: 12/)).toBeInTheDocument();
    expect(screen.getByText("Иванова")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Оценить" })).toHaveAttribute(
      "href",
      "/app/doctor/clients/u1?scope=appointments#doctor-client-section-pending-program-tests",
    );
    expect(screen.getByText("Показаны первые 1 из 12")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Тесты к проверке" })).toHaveAttribute(
      "href",
      "#doctor-today-section-pending-tests",
    );
    expect(screen.getByText(/попыток: 12/)).toBeInTheDocument();
  });

  it("renders proactive patient insights section and attention link", () => {
    const data: TodayDashboardData = {
      ...emptyData(),
      proactiveInsightsTotal: 2,
      proactiveInsightsTruncated: false,
      proactiveInsights: [
        {
          kind: "wellbeing_low_streak",
          patientUserId: "u1",
          patientDisplayName: "Петров",
          summary: "Низкое самочувствие 3 дн. подряд",
          sortAt: "2026-06-02T00:00:00.000Z",
          href: "/app/doctor/clients/u1",
        },
      ],
    };
    render(<DoctorTodayDashboard data={data} kpiStats={emptyKpi} appointmentsTodayCount={0} />);
    expect(screen.getByRole("heading", { name: "Сигналы пациентов" })).toBeInTheDocument();
    expect(screen.getByText("Петров")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Сигналы пациентов" })).toHaveAttribute(
      "href",
      "#doctor-today-section-proactive-insights",
    );
    expect(screen.getByText(/— 2/)).toBeInTheDocument();
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
    render(
      <DoctorTodayDashboard data={data} kpiStats={emptyKpi} appointmentsTodayCount={0} />,
    );
    expect(screen.getByText(/Всего непрочитанных: 5/)).toBeInTheDocument();
    expect(screen.getByText("Пациент")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
