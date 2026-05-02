/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ClientListItem } from "@/modules/doctor-clients/ports";
import { DoctorClientsPanel } from "./DoctorClientsPanel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
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
    cancellationCount30d: 0,
    ...overrides,
  };
}

describe("DoctorClientsPanel", () => {
  it("renders phone, Telegram and MAX channel indicators in order", () => {
    const list = [
      baseItem({
        userId: "a",
        displayName: "A",
        phone: "+7 900 000-00-00",
        bindings: { telegramId: "tg1", maxId: "m1" },
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
  });

  it("renders only phone indicator when other channels are absent", () => {
    const list = [baseItem({ userId: "b", displayName: "B", phone: "+1" })];
    render(<DoctorClientsPanel allClients={list} urlParams={{}} basePath="/app/doctor/clients" />);
    const row = document.getElementById("doctor-clients-card-b");
    expect(within(row!).getByLabelText("Телефон указан")).toBeInTheDocument();
    expect(screen.queryByLabelText("Подключён Telegram")).toBeNull();
  });

  it("shows compact cancellation badge when cancellationCount30d > 0", () => {
    const list = [baseItem({ userId: "c", displayName: "C", cancellationCount30d: 2 })];
    render(<DoctorClientsPanel allClients={list} urlParams={{}} basePath="/app/doctor/clients" />);
    const row = document.getElementById("doctor-clients-card-c");
    expect(within(row!).getByText(/2/)).toBeInTheDocument();
    expect(within(row!).getByText(/отмены/)).toBeInTheDocument();
  });

  it("does not show raw phone as a text line in the row", () => {
    const phone = "+7 (900) 123-45-67";
    const list = [baseItem({ userId: "d", displayName: "Doe", phone })];
    const { container } = render(
      <DoctorClientsPanel allClients={list} urlParams={{}} basePath="/app/doctor/clients" />,
    );
    expect(container.textContent).not.toContain(phone);
  });
});
