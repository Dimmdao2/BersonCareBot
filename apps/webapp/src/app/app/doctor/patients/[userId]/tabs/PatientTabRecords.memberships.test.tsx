/** @vitest-environment jsdom */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PatientAppointmentItem } from "@/modules/doctor-clients/ports";
import { PatientTabRecords, type ApiPackage } from "./PatientTabRecords";

const platformUserId = "00000000-0000-4000-8000-000000000099";

type SessionRow = {
  linkage: string;
  startsAt: string;
  isPast: boolean;
};

const sessionsByPackage = new Map<string, SessionRow[]>();

function packageRow(input: {
  id: string;
  displayNumber: number;
  title: string;
  status?: string;
  serviceTitle: string;
  quantityInitial: number;
  remaining: number;
}): ApiPackage {
  return {
    id: input.id,
    displayNumber: input.displayNumber,
    title: input.title,
    status: input.status ?? "active",
    soldAt: "2026-06-01T00:00:00.000Z",
    validUntil: null,
    balance: {
      items: [
        {
          quantityInitial: input.quantityInitial,
          remaining: input.remaining,
          displayRemaining: input.remaining,
          serviceTitle: input.serviceTitle,
        },
      ],
    },
  };
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  return String(input);
}

function renderRecords(initialPackages: ApiPackage[], initialAppointments: PatientAppointmentItem[] = []) {
  render(
    <PatientTabRecords
      userId={platformUserId}
      initialAppointments={initialAppointments}
      initialPackages={initialPackages}
      initialPaymentsSummary={{ payments: [], totalPaidMinor: 0 }}
    />,
  );
}

describe("PatientTabRecords memberships panel", () => {
  beforeEach(() => {
    sessionsByPackage.clear();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      const match = url.match(/\/patient-packages\/([^/]+)\/sessions/);
      if (match) {
        return {
          ok: true,
          json: async () => ({ ok: true, sessions: sessionsByPackage.get(match[1]!) ?? [] }),
        } as Response;
      }
      return { ok: true, json: async () => ({ ok: true }) } as Response;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders all active packages without refetching the package list", async () => {
    const first = packageRow({
      id: "pkg-active-1",
      displayNumber: 1,
      title: "Реабилитация",
      serviceTitle: "ЛФК",
      quantityInitial: 4,
      remaining: 3,
    });
    const second = packageRow({
      id: "pkg-active-2",
      displayNumber: 2,
      title: "Массаж",
      serviceTitle: "Массаж",
      quantityInitial: 6,
      remaining: 5,
    });

    renderRecords([first, second]);

    expect(await screen.findByText("Реабилитация")).toBeInTheDocument();
    expect(screen.getByText("Массаж")).toBeInTheDocument();
    expect(screen.getByText("аб.#001")).toBeInTheDocument();
    expect(screen.getByText("аб.#002")).toBeInTheDocument();

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/doctor/booking-engine/patient-packages/pkg-active-1/sessions?includePast=true",
        { credentials: "include" },
      );
    });
    expect(
      vi.mocked(globalThis.fetch).mock.calls.some(([input]) =>
        requestUrl(input).includes("/patient-packages?platformUserId="),
      ),
    ).toBe(false);
  });

  it("moves an active package to collapsed history when every session is consumed in the past", async () => {
    const open = packageRow({
      id: "pkg-open",
      displayNumber: 3,
      title: "Активный курс",
      serviceTitle: "ЛФК",
      quantityInitial: 4,
      remaining: 2,
    });
    const closed = packageRow({
      id: "pkg-closed",
      displayNumber: 4,
      title: "Закрытый курс",
      serviceTitle: "Массаж",
      quantityInitial: 2,
      remaining: 0,
    });
    sessionsByPackage.set("pkg-closed", [
      { linkage: "consumed", startsAt: "2026-06-03T10:00:00.000Z", isPast: true },
      { linkage: "consumed", startsAt: "2026-06-10T10:00:00.000Z", isPast: true },
    ]);

    const user = userEvent.setup();
    renderRecords([open, closed]);

    await waitFor(() => {
      expect(screen.getByText("активных 1")).toBeInTheDocument();
    });
    expect(screen.getByText("Активный курс")).toBeInTheDocument();
    expect(screen.getByText("История закрытых абонементов")).toBeInTheDocument();

    const historyButton = screen.getByRole("button", { name: /аб\.#004 · Закрытый курс/ });
    expect(historyButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Массаж ×2 шт")).not.toBeInTheDocument();

    await user.click(historyButton);

    expect(historyButton).toHaveAttribute("aria-expanded", "true");
    expect(within(historyButton).getByText("использовано 2/2")).toBeInTheDocument();
    expect(screen.getByText("Массаж ×2 шт")).toBeInTheDocument();
    expect(screen.getByText("Списания (2):")).toBeInTheDocument();
  });

  it("keeps an active package visible when sessions are not all consumed in the past", async () => {
    const reserved = packageRow({
      id: "pkg-reserved",
      displayNumber: 5,
      title: "Будущий резерв",
      serviceTitle: "ЛФК",
      quantityInitial: 1,
      remaining: 0,
    });
    sessionsByPackage.set("pkg-reserved", [
      { linkage: "reserved", startsAt: "2026-08-03T10:00:00.000Z", isPast: false },
    ]);

    renderRecords([reserved]);

    await waitFor(() => {
      expect(screen.getByText("активных 1")).toBeInTheDocument();
    });
    expect(screen.getByText("Будущий резерв")).toBeInTheDocument();
    expect(screen.queryByText("История закрытых абонементов")).not.toBeInTheDocument();
  });

  it("toggles a violet border on appointments linked to the selected package", async () => {
    const active = packageRow({
      id: "pkg-active-highlight",
      displayNumber: 6,
      title: "Активная подсветка",
      serviceTitle: "ЛФК",
      quantityInitial: 2,
      remaining: 1,
    });
    const closed = packageRow({
      id: "pkg-closed-highlight",
      displayNumber: 7,
      title: "Историческая подсветка",
      serviceTitle: "Массаж",
      quantityInitial: 1,
      remaining: 0,
    });
    sessionsByPackage.set("pkg-closed-highlight", [
      { linkage: "consumed", startsAt: "2026-06-03T10:00:00.000Z", isPast: true },
    ]);

    const activeAppointment: PatientAppointmentItem = {
      id: "appt-active",
      dateTime: "2026-07-08T10:00:00.000Z",
      status: "upcoming",
      serviceName: "ЛФК",
      location: "Клиника",
      durationMin: 60,
      isPackage: true,
      patientPackageId: "pkg-active-highlight",
      packageTitle: "Активная подсветка",
      packageDisplayNumber: 6,
    };
    const historyAppointment: PatientAppointmentItem = {
      id: "appt-history",
      dateTime: "2026-06-02T10:00:00.000Z",
      status: "completed",
      serviceName: "Массаж",
      location: "Клиника",
      durationMin: 45,
      isPackage: true,
      patientPackageId: "pkg-closed-highlight",
      packageTitle: "Историческая подсветка",
      packageDisplayNumber: 7,
    };

    const user = userEvent.setup();
    renderRecords([active, closed], [activeAppointment, historyAppointment]);

    await waitFor(() => {
      expect(screen.getByText("активных 1")).toBeInTheDocument();
    });

    const activeVisit = screen.getByText("ср 08.07.2026 · 13:00").closest(".rounded-xl");
    const historyVisit = screen.getByText("02.06.2026").closest(".rounded-lg");
    expect(activeVisit).not.toBeNull();
    expect(historyVisit).not.toBeNull();

    const activeEye = screen.getByRole("button", {
      name: /Подсветить записи абонемента аб\.#006 Активная подсветка/,
    });
    await user.click(activeEye);

    expect(activeEye).toHaveAttribute("aria-pressed", "true");
    expect(activeVisit).toHaveClass("border-violet-500/60");
    expect(historyVisit).not.toHaveClass("border-violet-500/60");

    await user.click(activeEye);

    expect(activeEye).toHaveAttribute("aria-pressed", "false");
    expect(activeVisit).not.toHaveClass("border-violet-500/60");

    const historyEye = screen.getByRole("button", {
      name: /Подсветить записи абонемента аб\.#007 Историческая подсветка/,
    });
    await user.click(historyEye);

    expect(historyEye).toHaveAttribute("aria-pressed", "true");
    expect(activeVisit).not.toHaveClass("border-violet-500/60");
    expect(historyVisit).toHaveClass("border-violet-500/60");
  });
});
