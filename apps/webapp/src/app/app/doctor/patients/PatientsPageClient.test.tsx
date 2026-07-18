/** @vitest-environment jsdom */

import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getClientCategory, PatientsPageClient } from "./PatientsPageClient";
import type { ClientListItem, DoctorDashboardPatientMetrics, PatientCardHeader } from "@/modules/doctor-clients/ports";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function client(overrides: Partial<ClientListItem> = {}): ClientListItem {
  return {
    userId: overrides.userId ?? "u1",
    displayName: overrides.displayName ?? "Пациент",
    firstName: overrides.firstName ?? null,
    lastName: overrides.lastName ?? null,
    patronymic: overrides.patronymic ?? null,
    phone: overrides.phone ?? null,
    bindings: overrides.bindings ?? {},
    hasEmail: overrides.hasEmail ?? false,
    hasApp: overrides.hasApp ?? false,
    hasWebPush: overrides.hasWebPush ?? false,
    nextAppointmentLabel: overrides.nextAppointmentLabel ?? null,
    hasAppointmentHistory: overrides.hasAppointmentHistory ?? false,
    lastAppointmentAt: overrides.lastAppointmentAt ?? null,
    activeAppointmentsCount: overrides.activeAppointmentsCount ?? 0,
    activeTreatmentProgram: overrides.activeTreatmentProgram ?? false,
    activeTreatmentProgramInstanceId: overrides.activeTreatmentProgramInstanceId ?? null,
    cancellationCount30d: overrides.cancellationCount30d ?? 0,
    rescheduleCount30d: overrides.rescheduleCount30d ?? 0,
    noShowCount: overrides.noShowCount ?? 0,
    visitedThisCalendarMonth: overrides.visitedThisCalendarMonth ?? false,
    hasConversation: overrides.hasConversation ?? false,
    unreadMessagesCount: overrides.unreadMessagesCount ?? 0,
    unreadExerciseCommentsCount: overrides.unreadExerciseCommentsCount ?? 0,
    isOnSupport: overrides.isOnSupport ?? false,
    hasMemberships: overrides.hasMemberships ?? false,
  };
}

const metrics: DoctorDashboardPatientMetrics = {
  totalClients: 4,
  onSupportCount: 2,
  visitedThisCalendarMonthCount: 0,
  withProgramCount: 0,
  membershipsCount: 0,
  subscriberCount: 0,
  newCount: 0,
  formerCount: 0,
  cancellationsCount: 0,
};

const patientHeader: PatientCardHeader = {
  identity: {
    userId: "u1",
    displayName: "Пациент",
    firstName: "Иван",
    lastName: "Петров",
    patronymic: null,
    phone: "+79990000001",
    email: "patient@example.test",
    bindings: {},
    hasConversation: true,
    isArchived: false,
    isBlocked: false,
    birthDate: null,
    age: null,
    gender: null,
  },
  support: {
    isOnSupport: true,
    startedAt: "2026-01-01T00:00:00.000Z",
    supportMonthsApprox: 6,
  },
  lastVisit: {
    date: "2026-06-01",
    visitType: null,
    city: null,
  },
  nextAppointment: {
    date: "2026-07-10",
    time: "15:30",
    city: null,
    appointmentType: null,
  },
  totalVisits: 3,
  cancellationsCount: 0,
  reschedulesCount: 0,
  noShowCount: 0,
  firstVisitDate: "2026-05-01",
};

async function renderPatientsPage(clients: ClientListItem[]) {
  await act(async () => {
    render(
      <PatientsPageClient
        listPromise={Promise.resolve(clients)}
        metricsPromise={Promise.resolve(metrics)}
        initialFilters={{ q: "", segment: null, archivedOnly: false }}
        patientPluralLabel="Клиенты"
        displayIana="Europe/Moscow"
      />,
    );
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PatientsPageClient", () => {
  it("shows all organization people by default and keeps factual KPI and channel filters on the desktop right panel", async () => {
    const user = userEvent.setup();
    await renderPatientsPage([
      client({
        userId: "with-appointment-support",
        displayName: "С записью и сопровождением",
        activeAppointmentsCount: 1,
        isOnSupport: true,
      }),
      client({
        userId: "support-only",
        displayName: "Только сопровождение",
        isOnSupport: true,
      }),
      client({
        userId: "appointment-only",
        displayName: "Только запись",
        activeAppointmentsCount: 1,
      }),
      client({
        userId: "subscriber-only",
        displayName: "Подписчик",
      }),
      client({
        userId: "membership-only",
        displayName: "Только абонемент",
        hasMemberships: true,
      }),
    ]);

    await screen.findByRole("searchbox", { name: "Поиск пациентов" });
    expect(screen.queryByRole("group", { name: "Фильтр: пациенты или все" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Категория клиентов" })).not.toBeInTheDocument();
    expect(screen.getByText("Подписчик")).toBeInTheDocument();
    expect(screen.getByText("Только абонемент")).toBeInTheDocument();
    expect(screen.getByText("Каналы связи")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Фильтр записей" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Фильтр программы упражнений" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Фильтр сопровождения" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Фильтр абонементов" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Пуш-уведомления" })).toBeInTheDocument();
    const rightPanel = screen.getByText("Каналы связи").closest("section");
    expect(rightPanel).toBeVisible();
    const splitLayout = Array.from(document.querySelectorAll("div")).find((element) =>
      element.className.includes("lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"),
    );
    expect(splitLayout).toBeDefined();

    await user.click(screen.getByRole("button", { name: /С записями/i }));

    const supportCard = document.getElementById("doctor-patients-segment-on_support");
    expect(supportCard).not.toBeNull();
    expect(within(supportCard as HTMLElement).getByText("1")).toBeInTheDocument();
    expect(within(supportCard as HTMLElement).getByText("2")).toBeInTheDocument();
    expect(within(supportCard as HTMLElement).queryByText("всего")).not.toBeInTheDocument();

    expect(screen.getByText("С записью и сопровождением")).toBeInTheDocument();
    expect(screen.getByText("Только запись")).toBeInTheDocument();
    expect(screen.queryByText("Только сопровождение")).not.toBeInTheDocument();

    await user.click(supportCard as HTMLElement);

    expect(screen.getByText("С записью и сопровождением")).toBeInTheDocument();
    expect(screen.queryByText("Только запись")).not.toBeInTheDocument();
    expect(screen.queryByText("Только сопровождение")).not.toBeInTheDocument();

    const appointmentsCard = document.getElementById("doctor-patients-segment-appointments");
    const membershipsCard = document.getElementById("doctor-patients-segment-memberships");
    expect(appointmentsCard).not.toBeNull();
    expect(membershipsCard).not.toBeNull();
    expect(within(appointmentsCard as HTMLElement).getByText("1")).toBeInTheDocument();
    expect(within(appointmentsCard as HTMLElement).getByText("2")).toBeInTheDocument();
  });

  it("filters channel buttons client-side without reloading the list", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/app/doctor/patients?channel=max");
    await renderPatientsPage([
      client({ userId: "telegram", displayName: "Telegram client", bindings: { telegramId: "tg-1" } }),
      client({ userId: "push", displayName: "Push client", hasWebPush: true }),
      client({ userId: "plain", displayName: "Plain client" }),
    ]);

    expect(await screen.findByText("Telegram client")).toBeInTheDocument();
    expect(screen.getByText("Push client")).toBeInTheDocument();
    expect(screen.getByText("Plain client")).toBeInTheDocument();
    expect(window.location.search).toBe("");

    await user.click(screen.getByRole("button", { name: "Пуш-уведомления" }));

    expect(screen.queryByText("Telegram client")).not.toBeInTheDocument();
    expect(screen.getByText("Push client")).toBeInTheDocument();
    expect(screen.queryByText("Plain client")).not.toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  it("sorts recent occurred appointments first, supports FIO sorting, and preserves search", async () => {
    const user = userEvent.setup();
    await renderPatientsPage([
      client({ userId: "null", displayName: "Яна", lastName: "Яна" }),
      client({ userId: "same-b", displayName: "Борис", lastName: "Борис", lastAppointmentAt: "2026-07-01T09:00:00.000Z" }),
      client({ userId: "newest", displayName: "Вера", lastName: "Вера", lastAppointmentAt: "2026-07-02T09:00:00.000Z" }),
      client({ userId: "same-a", displayName: "Алексей", lastName: "Алексей", lastAppointmentAt: "2026-07-01T09:00:00.000Z" }),
    ]);

    const listIds = () => Array.from(document.querySelectorAll("#doctor-patients-list > li")).map((item) => item.id);
    expect(listIds()).toEqual([
      "doctor-patients-item-newest",
      "doctor-patients-item-same-a",
      "doctor-patients-item-same-b",
      "doctor-patients-item-null",
    ]);

    const recentSort = screen.getByRole("button", { name: "Недавние: недавние сверху" });
    expect(recentSort).toHaveAttribute("aria-pressed", "true");
    await user.click(recentSort);
    expect(listIds()).toEqual([
      "doctor-patients-item-same-a",
      "doctor-patients-item-same-b",
      "doctor-patients-item-newest",
      "doctor-patients-item-null",
    ]);

    const fioSort = screen.getByRole("button", { name: "По фамилии: А–Я" });
    await user.click(fioSort);
    expect(listIds()).toEqual([
      "doctor-patients-item-same-a",
      "doctor-patients-item-same-b",
      "doctor-patients-item-newest",
      "doctor-patients-item-null",
    ]);

    await user.click(screen.getByRole("button", { name: "По фамилии: А–Я" }));
    expect(listIds()).toEqual([
      "doctor-patients-item-null",
      "doctor-patients-item-newest",
      "doctor-patients-item-same-b",
      "doctor-patients-item-same-a",
    ]);

    await user.type(screen.getByRole("searchbox", { name: "Поиск пациентов" }), "Вера");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220));
    });

    expect(listIds()).toEqual(["doctor-patients-item-newest"]);
  });

  it("keeps membership-only classification dormant and shows only approved informational row indicators", async () => {
    await renderPatientsPage([
      client({ userId: "subscriber", displayName: "Подписчик" }),
      client({ userId: "history", displayName: "Только история", hasAppointmentHistory: true }),
      client({ userId: "future", displayName: "Будущая запись", activeAppointmentsCount: 3 }),
      client({ userId: "support", displayName: "Только сопровождение", isOnSupport: true }),
      client({ userId: "program", displayName: "Только программа", activeTreatmentProgram: true }),
      client({ userId: "program-support", displayName: "Программа и сопровождение", activeTreatmentProgram: true, isOnSupport: true }),
      client({ userId: "membership", displayName: "С абонементом", hasMemberships: true }),
    ]);

    expect(getClientCategory(client({ hasMemberships: true }))).toBe("client");
    expect(screen.getByText("Подписчик")).toBeInTheDocument();

    const historyRow = within(document.getElementById("doctor-patients-item-history") as HTMLElement);
    const futureRow = within(document.getElementById("doctor-patients-item-future") as HTMLElement);
    const supportRow = within(document.getElementById("doctor-patients-item-support") as HTMLElement);
    const programRow = within(document.getElementById("doctor-patients-item-program") as HTMLElement);
    const programSupportRow = within(document.getElementById("doctor-patients-item-program-support") as HTMLElement);
    const membershipRow = within(document.getElementById("doctor-patients-item-membership") as HTMLElement);

    expect(historyRow.queryByLabelText(/Будущие записи/)).not.toBeInTheDocument();
    expect(futureRow.getByLabelText("Будущие записи: 3")).toBeInTheDocument();
    expect(supportRow.getByLabelText("Клиент на сопровождении")).toBeInTheDocument();
    expect(programRow.getByLabelText("Назначенная программа")).toBeInTheDocument();
    expect(programSupportRow.getByLabelText("Клиент на сопровождении")).toBeInTheDocument();
    expect(programSupportRow.queryByLabelText("Назначенная программа")).not.toBeInTheDocument();
    expect(membershipRow.getByLabelText("Есть абонемент")).toBeInTheDocument();

    for (const row of [historyRow, futureRow, supportRow, programRow, programSupportRow, membershipRow]) {
      expect(row.queryByLabelText(/Переписка|История|Telegram|MAX|Телефон|email|приложение/i)).not.toBeInTheDocument();
      const indicatorRail = row.getByLabelText("Статусы клиента");
      expect(indicatorRail).toHaveClass("grid", "w-[7.75rem]", "grid-cols-4");
      expect(indicatorRail.children).toHaveLength(4);
    }
  });

  it("shows one structured FIO line without repeating the legacy display name", async () => {
    await renderPatientsPage([
      client({
        userId: "structured-fio",
        displayName: "Старая строка",
        lastName: "Петров",
        firstName: "Иван",
        patronymic: "Сергеевич",
      }),
    ]);

    expect(await screen.findByText("Петров Иван Сергеевич")).toBeInTheDocument();
    expect(screen.queryByText("Старая строка")).not.toBeInTheDocument();
  });

  it("opens an Exercises-style detail view from a patient row with communication actions and visit summary", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("treatment-program-instances")) {
          return {
            ok: true,
            json: async () => ({ ok: true, items: [{ id: "program-1", title: "Колено: этап 1", status: "active" }] }),
          };
        }
        return {
          ok: true,
          json: async () => ({ ok: true, header: patientHeader }),
        };
      }),
    );

    await renderPatientsPage([
      client({
        userId: "u1",
        displayName: "Петров Иван",
        firstName: "Иван",
        lastName: "Петров",
        phone: "+79990000001",
        bindings: { telegramId: "123456", maxId: "max-1" },
        hasEmail: true,
        hasApp: true,
        hasWebPush: true,
        hasConversation: true,
        activeAppointmentsCount: 1,
        activeTreatmentProgram: true,
        isOnSupport: true,
        hasMemberships: true,
      }),
    ]);

    await user.click(screen.getByRole("button", { name: /Петров Иван/i }));

    const listItem = document.getElementById("doctor-patients-item-u1");
    expect(listItem).not.toBeNull();
    expect(within(listItem as HTMLElement).queryByText("Прошлый визит:")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "← Назад" })).toBeInTheDocument();
    const previewRoot = screen.getByRole("button", { name: "Закрыть" }).closest("div.rounded-xl");
    expect(previewRoot).not.toBeNull();
    const preview = within(previewRoot as HTMLElement);
    expect(preview.getByRole("button", { name: /Чат/i })).toBeEnabled();
    expect(preview.getByRole("link", { name: /Позвонить/i })).toHaveAttribute("href", "tel:+79990000001");
    expect(preview.getByRole("link", { name: /Карта/i })).toHaveAttribute("href", "/app/doctor/patients/u1");
    expect(preview.getByRole("button", { name: "Скопировать Telegram ID" })).toBeEnabled();
    expect(preview.getByRole("button", { name: "Скопировать MAX ID" })).toBeEnabled();
    expect(preview.getByRole("link", { name: /Вкладка/i })).toHaveAttribute("href", "/app/doctor/patients/u1?tab=comms");

    expect(await preview.findByRole("link", { name: /Email/i })).toHaveAttribute("href", "mailto:patient@example.test");
    expect(await preview.findByText("Колено: этап 1")).toBeInTheDocument();
    expect(preview.getByText("Приложение")).toBeInTheDocument();
    expect(preview.getByText("Пуши включены")).toBeInTheDocument();
    expect(preview.getByText("01.06.2026")).toBeInTheDocument();
    expect(preview.getByText("10.07.2026 15:30")).toBeInTheDocument();
    expect(preview.getByText("3")).toBeInTheDocument();
  });
});
