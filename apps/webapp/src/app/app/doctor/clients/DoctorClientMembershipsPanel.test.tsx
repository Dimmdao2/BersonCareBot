/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DoctorClientMembershipsPanel } from "./DoctorClientMembershipsPanel";

// react-hot-toast is a side-effect import in the component; stub it so tests don't error.
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/app/doctor/clients",
  useSearchParams: () => new URLSearchParams(),
}));

const platformUserId = "00000000-0000-4000-8000-000000000099";
let packagesResponse: unknown[] = [];
let sessionsResponse: unknown[] = [];
let detailResponse: unknown = { ok: true, history: [] };

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  return String(input);
}

function mockFetchResponse(data: unknown): Response {
  return { ok: true, json: async () => data } as Response;
}

describe("DoctorClientMembershipsPanel", () => {
  beforeEach(() => {
    packagesResponse = [];
    sessionsResponse = [];
    detailResponse = {
      ok: true,
      history: [{ id: "h1", eventType: "manual_created", occurredAt: "2026-06-01T00:00:00Z" }],
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (/\/patient-packages\/[^/]+$/.test(url) && !url.includes("/sessions")) {
        return mockFetchResponse(detailResponse);
      }
      if (/\/patient-packages(\?|$)/.test(url)) {
        return mockFetchResponse({ ok: true, packages: packagesResponse });
      }
      if (/\/patient-packages\/[^/]+\/sessions/.test(url)) {
        return mockFetchResponse({ ok: true, sessions: sessionsResponse });
      }
      if (/\/booking-engine\/services(\?|$)/.test(url)) {
        return mockFetchResponse({ ok: true, services: [] });
      }
      if (/\/booking-engine\/packages(\?|$)/.test(url)) {
        return mockFetchResponse({ ok: true, packages: [] });
      }
      return mockFetchResponse({ ok: true });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("renders doctor membership workflow sections", async () => {
    render(<DoctorClientMembershipsPanel platformUserId={platformUserId} />);
    expect(await screen.findByText("Нет активных абонементов.")).toBeTruthy();
    expect(screen.getByText("Назначить из каталога")).toBeTruthy();
    expect(screen.getByText("Индивидуальный абонемент")).toBeTruthy();
    expect(screen.getByText("Списать сеанс по абонементу")).toBeTruthy();
    expect(screen.queryByText("Отвязать / вернуть сеанс")).toBeNull();
    expect(screen.queryByText(/ID записи/)).toBeNull();
  });

  it("renders active package balance, sessions and history", async () => {
    packagesResponse = [
      {
        id: "pkg-1",
        displayNumber: 17,
        title: "Реабилитация 4 занятия",
        status: "active",
        soldAt: "2026-06-01T00:00:00Z",
        validUntil: "2026-12-01T00:00:00Z",
        paidAmountMinor: 12000,
        paidCurrency: "RUB",
        notes: "коммент",
        balance: {
          items: [
            {
              patientPackageItemId: "item-1",
              serviceId: "svc-1",
              serviceTitle: "ЛФК",
              remaining: 2,
              displayRemaining: 3,
              reserved: 1,
            },
          ],
        },
      },
    ];
    sessionsResponse = [
      {
        appointmentId: "appt-1",
        startsAt: "2026-07-01T10:00:00Z",
        endsAt: null,
        status: "confirmed",
        branchTitle: "Клиника",
        serviceTitle: "ЛФК",
        serviceId: "svc-1",
        linkage: "reserved",
        mappingStatus: "ok",
        isPast: false,
        actions: {
          canUnlinkReserve: true,
          canRefundConsumed: false,
          canManualConsume: true,
          canOpenInCalendar: true,
        },
      },
    ];

    const user = userEvent.setup();
    render(<DoctorClientMembershipsPanel platformUserId={platformUserId} />);

    expect(await screen.findByText(/дата покупки/)).toBeTruthy();
    expect(screen.getByText("аб.#017")).toBeTruthy();
    expect(screen.getByText("ЛФК: остаток 3 (зарезервировано 1)")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Записи" }));
    expect(await screen.findByLabelText("Показать прошедшие")).toBeTruthy();
    expect(screen.getByText("Отвязать")).toBeTruthy();
    expect(screen.getByText("Списать как оказанную")).toBeTruthy();
    await user.click(screen.getByText("История"));
    expect(await screen.findByText("Создан вручную")).toBeTruthy();
  });

  it("renders human package numbers and all active package cards", async () => {
    packagesResponse = [
      {
        id: "pkg-21",
        displayNumber: 21,
        title: "ЛФК утро",
        status: "active",
        soldAt: "2026-06-21T00:00:00Z",
        validUntil: null,
        paidAmountMinor: 9000,
        paidCurrency: "RUB",
        notes: null,
        balance: {
          items: [
            {
              patientPackageItemId: "item-21",
              serviceId: "svc-lfk",
              serviceTitle: "ЛФК",
              quantityInitial: 6,
              remaining: 4,
              displayRemaining: 5,
              reserved: 1,
            },
          ],
        },
      },
      {
        id: "pkg-22",
        displayNumber: 22,
        title: "Массаж вечер",
        status: "active",
        soldAt: "2026-06-22T00:00:00Z",
        validUntil: null,
        paidAmountMinor: 7000,
        paidCurrency: "RUB",
        notes: null,
        balance: {
          items: [
            {
              patientPackageItemId: "item-22",
              serviceId: "svc-massage",
              serviceTitle: "Массаж",
              quantityInitial: 4,
              remaining: 2,
              displayRemaining: 2,
              reserved: 0,
            },
          ],
        },
      },
    ];

    render(<DoctorClientMembershipsPanel platformUserId={platformUserId} />);

    expect(await screen.findByText("ЛФК утро")).toBeTruthy();
    expect(screen.getByText("Массаж вечер")).toBeTruthy();
    expect(screen.getByText("аб.#021")).toBeTruthy();
    expect(screen.getByText("аб.#022")).toBeTruthy();
    expect(screen.getByText("Осталось 5 визитов:")).toBeTruthy();
    expect(screen.getByText("5 x ЛФК")).toBeTruthy();
    expect(screen.getByText("Осталось 2 визитов:")).toBeTruthy();
    expect(screen.getByText("2 x Массаж")).toBeTruthy();
  });

  it("hides create forms when showCreateForm=false", async () => {
    render(<DoctorClientMembershipsPanel platformUserId={platformUserId} showCreateForm={false} />);
    expect(await screen.findByText("Нет активных абонементов.")).toBeTruthy();
    expect(screen.queryByText("Назначить из каталога")).toBeNull();
    expect(screen.queryByText("Индивидуальный абонемент")).toBeNull();
    // Manual consume section must still be present
    expect(screen.getByText("Списать сеанс по абонементу")).toBeTruthy();
  });

  it("shows «Пересчитать» button on active package and fires recalc API on click", async () => {
    const toastMock = await import("react-hot-toast");
    // Set up packages and recalc response via the shared beforeEach spy.
    packagesResponse = [
      {
        id: "pkg-recalc",
        title: "Тест абонемент",
        status: "active",
        soldAt: "2026-06-01T00:00:00Z",
        validUntil: null,
        paidAmountMinor: 10000,
        paidCurrency: "RUB",
        notes: null,
        balance: {
          items: [
            {
              patientPackageItemId: "item-r1",
              serviceId: "svc-1",
              serviceTitle: "ЛФК",
              remaining: 3,
              displayRemaining: 3,
              reserved: 0,
            },
          ],
        },
      },
    ];

    const recalcSummary = {
      patientPackageId: "pkg-recalc",
      debited: [
        { appointmentId: "appt-1", patientPackageItemId: "item-r1", serviceId: "svc-1", usageId: "u1" },
      ],
      skipped: [],
      outOfBalance: [],
    };

    // Override the fetch spy to additionally handle the recalc route.
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (/\/patient-packages\/[^/]+\/recalc/.test(url)) {
        return mockFetchResponse({ ok: true, summary: recalcSummary });
      }
      if (/\/patient-packages\/[^/]+$/.test(url) && !url.includes("/sessions")) {
        return mockFetchResponse(detailResponse);
      }
      if (/\/patient-packages(\?|$)/.test(url)) {
        return mockFetchResponse({ ok: true, packages: packagesResponse });
      }
      if (/\/patient-packages\/[^/]+\/sessions/.test(url)) {
        return mockFetchResponse({ ok: true, sessions: sessionsResponse });
      }
      if (/\/booking-engine\/services(\?|$)/.test(url)) {
        return mockFetchResponse({ ok: true, services: [] });
      }
      if (/\/booking-engine\/packages(\?|$)/.test(url)) {
        return mockFetchResponse({ ok: true, packages: [] });
      }
      return mockFetchResponse({ ok: true });
    });

    const user = userEvent.setup();
    render(<DoctorClientMembershipsPanel platformUserId={platformUserId} />);

    // Wait for package to load (title appears in both card <p> and consume-dropdown <option>)
    expect(await screen.findAllByText("Тест абонемент")).toBeTruthy();
    const recalcBtn = screen.getByRole("button", { name: "Пересчитать" });
    await user.click(recalcBtn);

    await waitFor(() => {
      expect(toastMock.default.success).toHaveBeenCalledWith("Списано 1 сеанс");
    });
  });

  it("shows «Нет новых сеансов для списания» toast when recalc returns empty debited", async () => {
    const toastMock = await import("react-hot-toast");
    packagesResponse = [
      {
        id: "pkg-empty",
        title: "Пустой абонемент",
        status: "active",
        soldAt: "2026-06-01T00:00:00Z",
        validUntil: null,
        paidAmountMinor: 5000,
        paidCurrency: "RUB",
        notes: null,
        balance: {
          items: [
            {
              patientPackageItemId: "item-e1",
              serviceId: "svc-2",
              serviceTitle: "Консультация",
              remaining: 5,
              displayRemaining: 5,
              reserved: 0,
            },
          ],
        },
      },
    ];

    // Override fetch spy to handle the recalc route with empty result.
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (/\/patient-packages\/[^/]+\/recalc/.test(url)) {
        return mockFetchResponse({ ok: true, summary: { debited: [], skipped: [], outOfBalance: [] } });
      }
      if (/\/patient-packages\/[^/]+$/.test(url) && !url.includes("/sessions")) {
        return mockFetchResponse(detailResponse);
      }
      if (/\/patient-packages(\?|$)/.test(url)) {
        return mockFetchResponse({ ok: true, packages: packagesResponse });
      }
      if (/\/patient-packages\/[^/]+\/sessions/.test(url)) {
        return mockFetchResponse({ ok: true, sessions: sessionsResponse });
      }
      if (/\/booking-engine\/services(\?|$)/.test(url)) {
        return mockFetchResponse({ ok: true, services: [] });
      }
      if (/\/booking-engine\/packages(\?|$)/.test(url)) {
        return mockFetchResponse({ ok: true, packages: [] });
      }
      return mockFetchResponse({ ok: true });
    });

    const user = userEvent.setup();
    render(<DoctorClientMembershipsPanel platformUserId={platformUserId} />);

    // Title appears in both card <p> and consume-dropdown <option>
    expect(await screen.findAllByText("Пустой абонемент")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Пересчитать" }));

    await waitFor(() => {
      expect(toastMock.default.success).toHaveBeenCalledWith("Нет новых сеансов для списания");
    });
  });
});
