/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ClientListItem } from "@/modules/doctor-clients/ports";
import { DoctorClientsPanel } from "./DoctorClientsPanel";

const routerReplaceMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: routerReplaceMock,
    push: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

function baseItem(overrides: Partial<ClientListItem> = {}): ClientListItem {
  return {
    userId: "00000000-0000-4000-8000-000000000001",
    displayName: "Иван Иванов",
    phone: null,
    bindings: {},
    nextAppointmentLabel: null,
    activeTreatmentProgram: false,
    activeTreatmentProgramInstanceId: null,
    cancellationCount30d: 0,
    hasMemberships: false,
    ...overrides,
  };
}

describe("DoctorClientsPanel", () => {
  beforeEach(() => {
    routerReplaceMock.mockReset();
  });

  it("renders phone, Telegram, MAX, email and app indicators", () => {
    const list = [
      baseItem({
        userId: "a",
        displayName: "A",
        phone: "+7 900 000-00-00",
        bindings: { telegramId: "tg1", maxId: "m1" },
        hasEmail: true,
        hasApp: true,
      }),
    ];
    render(
      <DoctorClientsPanel
        allClients={list}
        urlParams={{}}
        basePath="/app/doctor/clients"
      />,
    );
    const row = document.getElementById("doctor-clients-card-a");
    expect(row).not.toBeNull();
    const scope = within(row!);
    expect(scope.getByLabelText("Телефон указан")).toBeInTheDocument();
    expect(scope.getByLabelText("Подключён Telegram")).toBeInTheDocument();
    expect(scope.getByLabelText("Подключён MAX")).toBeInTheDocument();
    expect(scope.getByLabelText("Указан email")).toBeInTheDocument();
    expect(scope.getByLabelText("Есть приложение")).toBeInTheDocument();
  });

  it("renders only phone indicator when other channels are absent", () => {
    const list = [baseItem({ userId: "b", displayName: "B", phone: "+1" })];
    render(<DoctorClientsPanel allClients={list} urlParams={{}} basePath="/app/doctor/clients" />);
    const row = document.getElementById("doctor-clients-card-b");
    expect(within(row!).getByLabelText("Телефон указан")).toBeInTheDocument();
    expect(screen.queryByLabelText("Подключён Telegram")).toBeNull();
  });

  it("renders activity icon badges for appointment/messages/comments", () => {
    const list = [
      baseItem({
        userId: "c",
        displayName: "C",
        hasAppointmentHistory: true,
        activeAppointmentsCount: 2,
        hasConversation: true,
        unreadMessagesCount: 3,
        activeTreatmentProgram: true,
        unreadExerciseCommentsCount: 1,
        isOnSupport: true,
      }),
    ];
    render(<DoctorClientsPanel allClients={list} urlParams={{}} basePath="/app/doctor/clients" />);
    const row = document.getElementById("doctor-clients-card-c");
    const scope = within(row!);
    expect(scope.getByLabelText("История записей, активных: 2")).toBeInTheDocument();
    expect(scope.getByLabelText("Переписка, непрочитанных: 3")).toBeInTheDocument();
    expect(scope.getByLabelText("Программа тренировок, новых комментариев: 1")).toBeInTheDocument();
    expect(scope.getByLabelText("Клиент на сопровождении")).toBeInTheDocument();
  });

  it("links patient row to canonical client card route", () => {
    const uid = "00000000-0000-4000-8000-000000000099";
    const list = [
      baseItem({
        userId: uid,
        displayName: "Карточка",
        activeTreatmentProgram: true,
        activeTreatmentProgramInstanceId: "inst-abc",
      }),
    ];
    render(
      <DoctorClientsPanel
        allClients={list}
        urlParams={{ scope: "all", treatmentProgram: "1" }}
        basePath="/app/doctor/clients"
      />,
    );
    const link = document.getElementById(`doctor-clients-card-${uid}`)!;
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", `/app/doctor/clients/${encodeURIComponent(uid)}?scope=all`);
    expect(link.getAttribute("href")).not.toContain("treatment-programs");
  });

  it("does not show raw phone as a text line in the row", () => {
    const phone = "+7 (900) 123-45-67";
    const list = [baseItem({ userId: "d", displayName: "Doe", phone })];
    const { container } = render(
      <DoctorClientsPanel allClients={list} urlParams={{}} basePath="/app/doctor/clients" />,
    );
    expect(container.textContent).not.toContain(phone);
  });

  it("filters list by 'without appointments' flag", () => {
    const list = [
      baseItem({ userId: "w1", displayName: "Without", hasAppointmentHistory: false }),
      baseItem({ userId: "w2", displayName: "With", hasAppointmentHistory: true }),
    ];
    render(
      <DoctorClientsPanel
        allClients={list}
        urlParams={{ withoutAppointments: "1" }}
        basePath="/app/doctor/clients"
      />,
    );
    expect(document.getElementById("doctor-clients-card-w1")).not.toBeNull();
    expect(document.getElementById("doctor-clients-card-w2")).toBeNull();
    expect(screen.getByRole("button", { name: /Без записей \(1\)/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("filters list by memberships flag", () => {
    const list = [
      baseItem({ userId: "m1", displayName: "Membership", hasMemberships: true }),
      baseItem({ userId: "m2", displayName: "No membership", hasMemberships: false }),
    ];
    render(
      <DoctorClientsPanel
        allClients={list}
        urlParams={{ memberships: "1" }}
        basePath="/app/doctor/clients"
      />,
    );
    expect(document.getElementById("doctor-clients-card-m1")).not.toBeNull();
    expect(document.getElementById("doctor-clients-card-m2")).toBeNull();
    expect(screen.getByRole("button", { name: "С абонементами" })).toHaveAttribute("aria-pressed", "true");
  });

  it("turning on 'without appointments' clears appointments segment", () => {
    const list = [
      baseItem({ userId: "s1", displayName: "With history", hasAppointmentHistory: true }),
      baseItem({ userId: "s2", displayName: "No history", hasAppointmentHistory: false }),
    ];
    render(
      <DoctorClientsPanel
        allClients={list}
        urlParams={{ scope: "all", segment: "appointments" }}
        basePath="/app/doctor/clients"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Без записей \(1\)/ }));

    const nextUrl = String(routerReplaceMock.mock.calls.at(-1)?.[0] ?? "");
    expect(nextUrl).toContain("scope=all");
    expect(nextUrl).toContain("withoutAppointments=1");
    expect(nextUrl).not.toContain("segment=appointments");
  });
});
