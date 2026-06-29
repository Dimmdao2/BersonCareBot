/** @vitest-environment jsdom */

import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PatientsPageClient } from "./PatientsPageClient";
import type { ClientListItem, DoctorDashboardPatientMetrics } from "@/modules/doctor-clients/ports";

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

async function renderPatientsPage(clients: ClientListItem[]) {
  await act(async () => {
    render(
      <PatientsPageClient
        listPromise={Promise.resolve(clients)}
        metricsPromise={Promise.resolve(metrics)}
        initialFilters={{ q: "", segment: null, channel: null, archivedOnly: false }}
        patientPluralLabel="Клиенты"
        displayIana="Europe/Moscow"
      />,
    );
  });
}

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
});
