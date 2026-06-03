/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { DoctorClientMembershipsPanel } from "./DoctorClientMembershipsPanel";

const platformUserId = "00000000-0000-4000-8000-000000000099";
let packagesResponse: unknown[] = [];

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
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (/\/patient-packages(\?|$)/.test(url)) {
        return mockFetchResponse({ ok: true, packages: packagesResponse });
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
    expect(screen.getByText("Отвязать / вернуть сеанс")).toBeTruthy();
  });

  it("renders active package balance and future reserves", async () => {
    packagesResponse = [
      {
        id: "pkg-1",
        title: "Реабилитация 4 занятия",
        status: "active",
        soldAt: "2026-06-01T00:00:00Z",
        paidAmountMinor: 12000,
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

    render(<DoctorClientMembershipsPanel platformUserId={platformUserId} />);

    expect(await screen.findByText("ЛФК: остаток 3 (зарезервировано 1)")).toBeTruthy();
    expect(screen.getAllByText("Реабилитация 4 занятия").length).toBeGreaterThan(0);
    expect(screen.getByText("Активен")).toBeTruthy();
  });
});
