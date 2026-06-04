/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DoctorClientMembershipsPanel } from "./DoctorClientMembershipsPanel";

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

    expect(await screen.findByText(/продажа/)).toBeTruthy();
    expect(screen.getByText("ЛФК: остаток 3 (зарезервировано 1)")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Записи" }));
    expect(await screen.findByLabelText("Показать прошедшие")).toBeTruthy();
    expect(screen.getByText("Отвязать")).toBeTruthy();
    expect(screen.getByText("Списать как оказанную")).toBeTruthy();
    await user.click(screen.getByText("История"));
    expect(await screen.findByText("Создан вручную")).toBeTruthy();
  });
});
