/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { CalendarAppointmentEvent } from "@/modules/booking-calendar/types";

vi.mock("@/app/app/settings/BookingStaffPaymentPanel", () => ({
  BookingStaffPaymentPanel: () => <div data-testid="payment-panel" />,
}));
vi.mock("@/app/app/doctor/clients/AppointmentStaffCommentsSection", () => ({
  AppointmentStaffCommentsSection: () => null,
}));
vi.mock("@/shared/ui/doctor/DoctorOpenChatButton", () => ({
  DoctorOpenChatButton: ({ children }: { children?: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));
vi.mock("./DoctorCalendarPatientSearch", () => ({
  DoctorCalendarPatientSearch: ({ onChange }: { onChange: (value: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onChange({
          id: null,
          displayName: "Новый пациент",
          lastName: "Новый",
          firstName: "Пациент",
          patronymic: null,
          phone: "+7 999 000-00-00",
          email: "patient@example.com",
          isNew: true,
        })
      }
    >
      Выбрать черновик нового пациента
    </button>
  ),
}));

import { DoctorCalendarEventPanel } from "./DoctorCalendarEventPanel";

const baseEvent: CalendarAppointmentEvent = {
  kind: "appointment",
  id: "appointment-1",
  startAt: "2026-07-20T10:00:00.000Z",
  endAt: "2026-07-20T11:00:00.000Z",
  status: "confirmed",
  source: "admin_manual",
  specialistId: null,
  specialistName: null,
  branchId: null,
  branchTitle: null,
  branchColor: null,
  roomId: null,
  roomTitle: null,
  serviceId: null,
  serviceTitle: null,
  platformUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  patientName: "Иванов Иван",
  patientPhone: null,
  bookingStatus: null,
  rubitimeId: null,
  rubitimeManageUrl: null,
  paymentStatus: null,
  prepaymentPending: false,
  packageUsageRef: null,
  packageTitle: null,
  packageDisplayNumber: null,
  rescheduleCount: 0,
  originalStartAt: null,
  formComments: [],
};

const commonProps = {
  apiBase: "/api/doctor/booking-engine",
  timeZone: "Europe/Moscow",
  filterMeta: { specialists: [], branches: [], rooms: [], services: [] },
  activeFilters: { specialistId: null, branchId: null, roomId: null, serviceId: null },
  onClose: vi.fn(),
  onChanged: vi.fn(),
};

describe("DoctorCalendarEventPanel patient heading", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ ok: true, reschedules: [], cancellations: [] }),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders the compact appointment detail contract without duplicate legacy actions", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(
      <DoctorCalendarEventPanel
        {...commonProps}
        selected={{
          ...baseEvent,
          patientPhone: "+7 999 000-00-00",
          branchTitle: "Филиал на Невском",
          serviceTitle: "Реабилитация",
          specialistName: "Петров Пётр",
          rubitimeId: "legacy-42",
          rubitimeManageUrl: "https://legacy.example.test/manage/42",
        }}
        filterMeta={{
          specialists: [
            { id: "specialist-1", label: "Петров Пётр" },
            { id: "specialist-2", label: "Сидоров Семён" },
          ],
          branches: [],
          rooms: [],
          services: [],
        }}
      />,
    );

    expect(screen.getAllByRole("link", { name: "Иванов Иван" })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Иванов Иван" })).not.toHaveClass("truncate");
    expect(screen.getByRole("button", { name: "Чат" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Позвонить:/ })).toHaveAttribute(
      "href",
      "tel:+79990000000",
    );
    const copyButton = screen.getByRole("button", { name: /Показать и скопировать телефон:/ });
    expect(copyButton).toHaveTextContent("+7 999 000-00-00");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.click(copyButton);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("+7 999 000-00-00"));
    expect(screen.getByRole("status")).toHaveTextContent("Скопировано");

    const status = screen.getByText("Подтверждена");
    expect(status).toHaveClass("h-7", "bg-emerald-500/10");
    expect(screen.queryByText(/Статус записи:/)).not.toBeInTheDocument();
    expect(screen.getByText("Филиал")).toBeInTheDocument();
    expect(screen.getByText("Филиал на Невском")).toBeInTheDocument();
    expect(screen.getByText("Услуга")).toBeInTheDocument();
    expect(screen.getByText("Реабилитация")).toBeInTheDocument();
    expect(screen.getByText("Специалист")).toBeInTheDocument();
    expect(screen.getByText("Петров Пётр")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Создать визит из записи" })).toHaveAttribute(
      "href",
      expect.stringContaining("createVisitFrom=appointment-1"),
    );
    expect(screen.getByRole("button", { name: "Закрыть карточку записи" })).toBeInTheDocument();
    expect(screen.queryByText(/Rubitime/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Карточка пациента")).not.toBeInTheDocument();
    expect(screen.queryByTestId("payment-panel")).not.toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });

  it("leaves close to the dialog host when the panel close is disabled", async () => {
    render(
      <DoctorCalendarEventPanel
        {...commonProps}
        selected={baseEvent}
        showCloseControl={false}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Закрыть карточку записи" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("appointment-detail-header")).toHaveClass("pr-10");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });

  it("shows original time only after a real minute-level reschedule", async () => {
    const { rerender } = render(
      <DoctorCalendarEventPanel
        {...commonProps}
        selected={{ ...baseEvent, originalStartAt: "2026-07-20T10:00:45.000Z" }}
      />,
    );
    expect(screen.queryByText(/Исходное время:/)).not.toBeInTheDocument();

    rerender(
      <DoctorCalendarEventPanel
        {...commonProps}
        selected={{ ...baseEvent, originalStartAt: "2026-07-20T09:30:00.000Z" }}
      />,
    );
    expect(screen.getByText(/Исходное время:/)).toHaveTextContent("20.07.2026 12:30");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });

  it("hides specialist only when server filter metadata proves solo mode", async () => {
    const selected = { ...baseEvent, specialistName: "Петров Пётр" };
    const { rerender } = render(
      <DoctorCalendarEventPanel
        {...commonProps}
        selected={selected}
        filterMeta={{
          specialists: [{ id: "specialist-1", label: "Петров Пётр" }],
          branches: [],
          rooms: [],
          services: [],
        }}
      />,
    );
    expect(screen.queryByText("Специалист")).not.toBeInTheDocument();

    rerender(<DoctorCalendarEventPanel {...commonProps} selected={selected} />);
    expect(screen.getByText("Специалист")).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });

  it("uses the destructive semantic tone for cancelled appointments", async () => {
    render(
      <DoctorCalendarEventPanel
        {...commonProps}
        selected={{ ...baseEvent, status: "cancelled_by_patient" }}
      />,
    );
    expect(screen.getByText("Отмена пациентом")).toHaveClass(
      "bg-destructive/15",
      "text-destructive",
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });

  it("links the FIO heading to the canonical patient card when a patient id exists", async () => {
    render(<DoctorCalendarEventPanel {...commonProps} selected={baseEvent} />);
    expect(screen.getByRole("heading", { name: "Иванов Иван" }).querySelector("a")).toHaveAttribute(
      "href",
      "/app/doctor/patients/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });

  it("keeps the heading plain when the appointment has no canonical patient id", async () => {
    render(
      <DoctorCalendarEventPanel
        {...commonProps}
        selected={{ ...baseEvent, platformUserId: null }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Иванов Иван" }).querySelector("a")).toBeNull();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });

  it("submits a new-patient draft through the atomic patient-visit endpoint", async () => {
    render(
      <DoctorCalendarEventPanel
        {...commonProps}
        selected={null}
        startInCreate
        createInitialStart="2026-07-20T10:00"
        createInitialEnd="2026-07-20T11:00"
        createInitialBranchId="11111111-1111-4111-8111-111111111111"
        createInitialServiceId="22222222-2222-4222-8222-222222222222"
        filterMeta={{
          specialists: [
            { id: "33333333-3333-4333-8333-333333333333", label: "Специалист" },
          ],
          branches: [
            { id: "11111111-1111-4111-8111-111111111111", label: "Филиал" },
          ],
          rooms: [],
          services: [
            {
              id: "22222222-2222-4222-8222-222222222222",
              label: "Услуга",
              durationMinutes: 60,
              availability: [
                {
                  specialistId: "33333333-3333-4333-8333-333333333333",
                  branchId: "11111111-1111-4111-8111-111111111111",
                },
              ],
            },
            {
              id: "44444444-4444-4444-8444-444444444444",
              label: "Услуга другого специалиста",
              durationMinutes: 30,
              availability: [
                {
                  specialistId: "55555555-5555-4555-8555-555555555555",
                  branchId: "11111111-1111-4111-8111-111111111111",
                },
              ],
            },
          ],
        }}
      />,
    );
    expect(screen.queryByText("Услуга другого специалиста")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Выбрать черновик нового пациента" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe("/api/doctor/booking-engine/appointments/manual-patient-visit");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      kind: "scheduled",
      lastName: "Новый",
      firstName: "Пациент",
      patronymic: null,
      phone: "+7 999 000-00-00",
      email: "patient@example.com",
    });
    expect(JSON.parse(String(init?.body))).not.toHaveProperty("specialistId");
  });
});
