/** @vitest-environment jsdom */

import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PatientsPageClient } from "./PatientsPageClient";
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
  it("keeps top category counts static and shows compact segment total when filtered count differs", async () => {
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
    ]);

    await screen.findByRole("searchbox", { name: "Поиск пациентов" });
    expect(screen.queryByRole("group", { name: "Фильтр: пациенты или все" })).not.toBeInTheDocument();
    const categoryGroup = screen.getByRole("group", { name: "Категория клиентов" });
    expect(within(categoryGroup).getByRole("button", { name: /Все 4/i })).toBeInTheDocument();
    expect(within(categoryGroup).getByRole("button", { name: /Клиенты 3/i })).toBeInTheDocument();
    expect(within(categoryGroup).getByRole("button", { name: /Подписчики 1/i })).toBeInTheDocument();
    expect(screen.getByText("Каналы связи")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Приём в этом месяце" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Есть отмены" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Без записей" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "С абонементами" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Архив" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Есть переносы" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Пуш-уведомления" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /С записями/i }));
    expect(within(categoryGroup).getByRole("button", { name: /Все 4/i })).toBeInTheDocument();
    expect(within(categoryGroup).getByRole("button", { name: /Клиенты 3/i })).toBeInTheDocument();
    expect(within(categoryGroup).getByRole("button", { name: /Подписчики 1/i })).toBeInTheDocument();

    const supportCard = document.getElementById("doctor-patients-segment-on_support");
    expect(supportCard).not.toBeNull();
    expect(within(supportCard as HTMLElement).getByText("1")).toBeInTheDocument();
    expect(within(supportCard as HTMLElement).getByText("2")).toBeInTheDocument();
    expect(within(supportCard as HTMLElement).queryByText("всего")).not.toBeInTheDocument();
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

  it("keeps only core status filters visible on mobile and hides secondary filters with responsive classes", async () => {
    await renderPatientsPage([client()]);

    expect(screen.queryByRole("button", { name: "Фильтр переписки" })).not.toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Фильтр записей" })).not.toHaveClass("hidden");
    expect(screen.getByRole("button", { name: "Фильтр программы упражнений" })).not.toHaveClass("hidden");
    expect(screen.getByRole("button", { name: "Фильтр сопровождения" })).not.toHaveClass("hidden");
    expect(screen.getByRole("button", { name: "Фильтр абонементов" })).not.toHaveClass("hidden");

    expect(screen.getByRole("button", { name: "Фильтр телефона" })).toHaveClass("hidden", "md:inline-flex");
    expect(screen.getByRole("button", { name: "Фильтр Telegram" })).toHaveClass("hidden", "md:inline-flex");
    expect(screen.getByRole("button", { name: "Фильтр MAX" })).toHaveClass("hidden", "md:inline-flex");
    expect(screen.getByRole("button", { name: "Фильтр email" })).toHaveClass("hidden", "md:inline-flex");
    expect(screen.getByRole("button", { name: "Фильтр приложения" })).toHaveClass("hidden", "md:inline-flex");
  });

  it("opens an inline preview from a patient row with communication actions and visit summary", async () => {
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
    const preview = within(listItem as HTMLElement);
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
