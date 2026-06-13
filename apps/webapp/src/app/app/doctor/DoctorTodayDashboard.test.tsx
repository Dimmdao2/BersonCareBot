/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DoctorTodayDashboard } from "./DoctorTodayDashboard";
import type { TodayDashboardData } from "./loadDoctorTodayDashboard";
import type { DoctorStatsState } from "@/modules/doctor-stats/service";

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
    title?: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const DEFAULT_DISPLAY_IANA = "Europe/Moscow";

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
    globalOpenTasksTotal: 0,
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

const emptyKpi: DoctorStatsState = {
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
      messengerBotBlocked: { telegram: 0, max: 0 },
    },
    messengerBotBlocked: { telegram: 0, max: 0 },
  },
};

function defaultProps() {
  return {
    data: emptyData(),
    kpiStats: emptyKpi,
    appointmentsTodayCount: 0,
    monthAppointmentCount: 0,
    displayIana: DEFAULT_DISPLAY_IANA,
  };
}

async function openLeftKpiDialog(label: RegExp) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: label }));
}

describe("DoctorTodayDashboard", () => {
  it("renders page title, analytics link, section headings for new layout", () => {
    render(
      <DoctorTodayDashboard
        {...defaultProps()}
        showAnalyticsLink
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Сегодня" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Аналитика по клиентам" })).toHaveAttribute(
      "href",
      "/app/doctor/analytics/clients",
    );
    expect(screen.getByRole("heading", { name: "На сопровождении" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Задачи" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Сигналы пациентов" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Следующая запись" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Расписание на сегодня" })).toBeInTheDocument();
    // Старые секции должны отсутствовать
    expect(screen.queryByRole("heading", { name: "Требует внимания" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Рабочие задачи на сегодня" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Записи сегодня" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ближайшие записи" })).not.toBeInTheDocument();
  });

  it("renders left KPI row with 4 compact counters", () => {
    render(
      <DoctorTodayDashboard
        {...defaultProps()}
        data={{ ...emptyData(), unreadTotal: 3, newIntakeRequests: [], pendingProgramTestsTotal: 5, exerciseCommentAttentionTotal: 1 }}
      />,
    );
    // Сообщения — ссылка (не кнопка)
    expect(screen.getByRole("link", { name: /Сообщения/i })).toBeInTheDocument();
    // Кнопочные KPI
    expect(screen.getByRole("button", { name: /Комментарии/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Заявки/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Тесты/i })).toBeInTheDocument();
  });

  it("renders right KPI row with 3 appointment counters", () => {
    render(
      <DoctorTodayDashboard
        {...defaultProps()}
        appointmentsTodayCount={3}
        kpiStats={{ ...emptyKpi, appointments: { ...emptyKpi.appointments, total: 12 } }}
        monthAppointmentCount={45}
      />,
    );
    expect(screen.getByRole("link", { name: /Сегодня/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Неделя/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Месяц/i })).toBeInTheDocument();
  });

  it("shows empty states for on-support and mini-calendar when no data", () => {
    render(<DoctorTodayDashboard {...defaultProps()} />);
    expect(screen.getByText("Клиентов на сопровождении нет")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Список клиентов" })).toHaveAttribute(
      "href",
      "/app/doctor/clients?scope=all&support=on",
    );
    // Мини-календарь: нет записей
    expect(screen.getByText("Записей на сегодня нет")).toBeInTheDocument();
    // Карточка приёма: нет записей
    expect(screen.getByText("На сегодня записей нет")).toBeInTheDocument();
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
    render(<DoctorTodayDashboard {...defaultProps()} data={data} />);
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

  it("opens intake details in attention dialog via left KPI card", async () => {
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
    render(<DoctorTodayDashboard {...defaultProps()} data={data} />);
    await openLeftKpiDialog(/Заявки/);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Анна")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть заявку" })).toHaveAttribute(
      "href",
      "/app/doctor/online-intake/int1",
    );
  });

  it("opens pending program tests in attention dialog via left KPI card", async () => {
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
    render(<DoctorTodayDashboard {...defaultProps()} data={data} />);
    await openLeftKpiDialog(/Тесты/);
    expect(screen.getByText(/Попыток без оценки: 12/)).toBeInTheDocument();
    expect(screen.getByText("Иванова")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Оценить" })).toHaveAttribute(
      "href",
      "/app/doctor/clients/u1?scope=appointments#doctor-client-section-pending-program-tests",
    );
    expect(screen.getByText("Показаны первые 1 из 12")).toBeInTheDocument();
  });

  it("opens proactive patient insights via signals section button", async () => {
    const user = userEvent.setup();
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
    render(<DoctorTodayDashboard {...defaultProps()} data={data} />);
    // Кнопка счётчика в секции «Сигналы пациентов»
    const signalBtn = screen.getByRole("button", { name: "2" });
    await user.click(signalBtn);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Петров")).toBeInTheDocument();
  });

  it("shows unread messages KPI as link to communications", () => {
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
    render(<DoctorTodayDashboard {...defaultProps()} data={data} />);
    // «Сообщения» — ссылка (не кнопка) ведёт на communications
    const msgLink = screen.getByRole("link", { name: /Сообщения/i });
    expect(msgLink).toHaveAttribute("href", "/app/doctor/communications");
  });

  it("opens exercise comments attention dialog via left KPI card", async () => {
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
    render(<DoctorTodayDashboard {...defaultProps()} data={data} />);
    await openLeftKpiDialog(/Комментарии/);
    expect(screen.getByRole("heading", { name: "Новые комментарии по упражнениям" })).toBeInTheDocument();
    expect(screen.getByText("Иванов Иван")).toBeInTheDocument();
    expect(screen.getByText("Приседания")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть комментарии в программе" })).toHaveAttribute(
      "href",
      "/app/doctor/clients/u1/treatment-programs/inst-1?scope=appointments&discussionItem=item-1",
    );
  });

  it("renders today appointments in mini-calendar section", () => {
    const data: TodayDashboardData = {
      ...emptyData(),
      todayAppointments: [
        {
          id: "ap1",
          time: "09:00",
          clientLabel: "Клиент Тест",
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
    };
    render(<DoctorTodayDashboard {...defaultProps()} data={data} />);
    // Мини-календарь должен показать запись
    expect(screen.getByRole("heading", { name: "Расписание на сегодня" })).toBeInTheDocument();
    // Карточка приёма
    expect(screen.getByRole("heading", { name: /Следующая запись|Сейчас на приёме/ })).toBeInTheDocument();
  });

  it("shows admin banners when provided", () => {
    render(
      <DoctorTodayDashboard
        {...defaultProps()}
        adminHealthBanner={{ show: true, title: "Внимание: сбой", href: "/app/doctor/system-health" }}
        adminRegistrationFailureBanner={{ show: true, title: "Сбой регистрации", href: "/app/doctor/health-archive", count: 1 }}
      />,
    );
    expect(screen.getByRole("link", { name: "Внимание: сбой" })).toHaveAttribute(
      "href",
      "/app/doctor/system-health",
    );
    expect(screen.getByRole("link", { name: "Сбой регистрации" })).toHaveAttribute(
      "href",
      "/app/doctor/health-archive",
    );
  });

  // §1.1 — Порядок блоков: «Расписание» выше «Следующей записи»
  it("§1.1 mini-calendar renders before appointment card in DOM order", () => {
    render(<DoctorTodayDashboard {...defaultProps()} />);
    const headings = screen.getAllByRole("heading");
    const calendarIdx = headings.findIndex((h) => h.textContent?.includes("Расписание на сегодня"));
    const nextApptIdx = headings.findIndex((h) => h.textContent?.includes("Следующая запись") || h.textContent?.includes("Сейчас на приёме"));
    expect(calendarIdx).toBeGreaterThanOrEqual(0);
    expect(nextApptIdx).toBeGreaterThanOrEqual(0);
    expect(calendarIdx).toBeLessThan(nextApptIdx);
  });

  // §1.3 — Задачи над «На сопровождении»
  it("§1.3 tasks section renders before on-support section in DOM order", () => {
    render(<DoctorTodayDashboard {...defaultProps()} />);
    const headings = screen.getAllByRole("heading");
    const tasksIdx = headings.findIndex((h) => h.textContent === "Задачи");
    const supportIdx = headings.findIndex((h) => h.textContent === "На сопровождении");
    expect(tasksIdx).toBeGreaterThanOrEqual(0);
    expect(supportIdx).toBeGreaterThanOrEqual(0);
    expect(tasksIdx).toBeLessThan(supportIdx);
  });

  // §1.3 — Метрика «сегодня N / всего M»
  it("§1.3 shows today/total task metric when tasks exist", () => {
    const todayTask = {
      id: "t1",
      ownerUserId: "u1",
      patientUserId: null,
      title: "Задача на сегодня",
      description: null,
      dueAt: "2026-06-13T09:00:00.000Z",
      remindAt: null,
      isImportant: false,
      completedAt: null,
      reminderSentAt: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    };
    const data: TodayDashboardData = {
      ...emptyData(),
      globalOpenTasks: [todayTask],
      globalOpenTasksTotal: 3,
    };
    render(<DoctorTodayDashboard {...defaultProps()} data={data} />);
    // Метрика total должна присутствовать в DOM
    expect(document.getElementById("doctor-today-tasks-metric")).toBeInTheDocument();
  });

  // §1.3 — Кнопка «Все задачи» появляется, когда есть задачи не на сегодня
  it("§1.3 shows All-tasks button when total > today count", async () => {
    const user = userEvent.setup();
    const otherTask = {
      id: "t2",
      ownerUserId: "u1",
      patientUserId: null,
      title: "Задача на другой день",
      description: null,
      dueAt: "2026-06-20T09:00:00.000Z",
      remindAt: null,
      isImportant: false,
      completedAt: null,
      reminderSentAt: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    };
    const data: TodayDashboardData = {
      ...emptyData(),
      globalOpenTasks: [otherTask],
      globalOpenTasksTotal: 1,
    };
    // todayIso не совпадает с дедлайном otherTask → hasMore должен быть true
    render(<DoctorTodayDashboard {...defaultProps()} data={data} />);
    const showAllBtn = document.getElementById("doctor-today-tasks-show-all");
    expect(showAllBtn).toBeInTheDocument();
    // Клик раскрывает все задачи
    await user.click(showAllBtn!);
    expect(screen.getByText("Задача на другой день")).toBeInTheDocument();
  });

  // §1.2 — workingBounds передаётся в mini-calendar
  it("§1.2 accepts todayWorkingBounds prop without error", () => {
    expect(() =>
      render(
        <DoctorTodayDashboard
          {...defaultProps()}
          todayWorkingBounds={{ startMinute: 9 * 60, endMinute: 18 * 60 }}
        />,
      ),
    ).not.toThrow();
  });
});
