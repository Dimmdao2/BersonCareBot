/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    exerciseCommentAttentionItems: [],
    exerciseCommentAttentionTotal: 0,
    exerciseCommentAttentionTruncated: false,
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

async function openAttentionDialog(label: RegExp) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: label }));
}

describe("DoctorTodayDashboard", () => {
  it("renders title, KPI, attention block, and remaining section headings", () => {
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
    expect(screen.getByRole("heading", { name: "На сопровождении" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Требует внимания" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Рабочие задачи на сегодня" })).toBeInTheDocument();
    expect(document.getElementById("doctor-today-primary-row")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Записи сегодня" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ближайшие записи" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "К проверке" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Новые онлайн-заявки" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Непрочитанные сообщения" })).not.toBeInTheDocument();
    expect(screen.getByText("Новые клиенты за 7 дн. без каналов связи")).toBeInTheDocument();
  });

  it("shows empty states and CTAs for on-support, today appointments, and upcoming", () => {
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
    expect(screen.getByText("Ближайших записей на неделе нет")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Все записи" })[0]).toHaveAttribute(
      "href",
      "/app/doctor/appointments?view=future",
    );
  });

  it("hides upcoming appointments when today has appointments", () => {
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
          branchName: null,
          scheduleProvenancePrefix: null,
          rubitimeNameIfDifferent: null,
          href: "/app/doctor/clients/user-1?scope=appointments",
          ctaLabel: "Открыть карточку",
        },
      ],
      upcomingAppointments: [
        {
          id: "ap2",
          time: "Пн 10:00",
          clientLabel: "Будущий",
          clientUserId: "user-2",
          type: "Осмотр",
          status: "created",
          branchName: null,
          scheduleProvenancePrefix: null,
          rubitimeNameIfDifferent: null,
          href: "/app/doctor/clients/user-2?scope=appointments",
          ctaLabel: "Открыть карточку",
        },
      ],
    };
    render(
      <DoctorTodayDashboard data={data} kpiStats={emptyKpi} appointmentsTodayCount={1} />,
    );
    expect(screen.queryByRole("heading", { name: "Ближайшие записи" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Пн 10:00 · Будущий/)).not.toBeInTheDocument();
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
    expect(screen.getByText("09:00 ·")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Клиент" })).toHaveAttribute(
      "href",
      "/app/doctor/clients/user-1?scope=appointments",
    );
    expect(screen.getByText(/Осмотр · created/)).toBeInTheDocument();
    expect(screen.getByText(/Филиал А/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Открыть карточку" })).not.toBeInTheDocument();
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

  it("opens intake details in attention dialog", async () => {
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
    await openAttentionDialog(/Онлайн-заявки/);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
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
          unreadMessagesCount: 2,
          exerciseDoneTodayCount: 1,
          newExerciseCommentsCount: 1,
        },
        {
          userId: "u-b",
          displayName: "Борис",
          href: "/app/doctor/clients/u-b?scope=appointments#doctor-client-section-treatment-programs",
          unreadMessagesCount: 0,
          exerciseDoneTodayCount: 0,
          newExerciseCommentsCount: 0,
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

  it("opens pending program tests in attention dialog", async () => {
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
    await openAttentionDialog(/Тесты к проверке/);
    expect(screen.getByText(/Попыток без оценки: 12/)).toBeInTheDocument();
    expect(screen.getByText("Иванова")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Оценить" })).toHaveAttribute(
      "href",
      "/app/doctor/clients/u1?scope=appointments#doctor-client-section-pending-program-tests",
    );
    expect(screen.getByText("Показаны первые 1 из 12")).toBeInTheDocument();
  });

  it("opens proactive patient insights in attention dialog", async () => {
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
    await openAttentionDialog(/Сигналы пациентов/);
    expect(screen.getByRole("heading", { name: "Сигналы пациентов" })).toBeInTheDocument();
    expect(screen.getByText("Петров")).toBeInTheDocument();
  });

  it("opens unread conversations in attention dialog", async () => {
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
    await openAttentionDialog(/Сообщения/);
    expect(screen.getByText(/Всего непрочитанных: 5/)).toBeInTheDocument();
    expect(screen.getByText("Пациент")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("opens exercise comments attention dialog grouped by patient", async () => {
    const data: TodayDashboardData = {
      ...emptyData(),
      exerciseCommentAttentionTotal: 1,
      exerciseCommentAttentionTruncated: false,
      exerciseCommentAttentionItems: [
        {
          patientUserId: "u1",
          patientDisplayName: "Иванов Иван",
          instanceId: "inst-1",
          stageItemId: "item-1",
          stageItemTitle: "Приседания",
          latestMessage: {
            id: "m1",
            instanceStageItemId: "item-1",
            patientUserId: "u1",
            senderRole: "patient",
            origin: "patient_observation",
            body: "Болит колено",
            mediaFileId: null,
            supportMessageId: null,
            createdAt: "2026-06-06T00:00:00.000Z",
          },
          latestMessageAtLabel: "06.06.2026, 03:00",
          href: "/app/doctor/clients/u1/treatment-programs/inst-1?scope=appointments&discussionItem=item-1",
        },
      ],
    };
    render(
      <DoctorTodayDashboard data={data} kpiStats={emptyKpi} appointmentsTodayCount={0} />,
    );
    await openAttentionDialog(/Новые комментарии по упражнениям/);
    expect(screen.getByRole("heading", { name: "Новые комментарии по упражнениям" })).toBeInTheDocument();
    expect(screen.getByText("Иванов Иван")).toBeInTheDocument();
    expect(screen.getByText("Приседания")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть комментарии в программе" })).toHaveAttribute(
      "href",
      "/app/doctor/clients/u1/treatment-programs/inst-1?scope=appointments&discussionItem=item-1",
    );
  });
});
