/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { DoctorClientMembershipsPanel } from "./DoctorClientMembershipsPanel";

const platformUserId = "00000000-0000-4000-8000-000000000099";

describe("DoctorClientMembershipsPanel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/patient-packages")) {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              packages: [
                {
                  id: "pkg-1",
                  title: "Абонемент 5",
                  status: "active",
                  soldAt: "2026-05-01T00:00:00Z",
                  paidAmountMinor: 10000,
                  balance: {
                    items: [
                      {
                        patientPackageItemId: "item-1",
                        serviceId: "svc-1",
                        serviceTitle: "Приём 60",
                        remaining: 4,
                        displayRemaining: 5,
                        reserved: 1,
                      },
                    ],
                  },
                },
              ],
            }),
          } as Response;
        }
        if (url.includes("/services")) {
          return { ok: true, json: async () => ({ ok: true, services: [] }) } as Response;
        }
        if (url.includes("/booking-engine/packages")) {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              packages: [{ id: "cat-1", title: "Каталог 10", priceMinor: 500000 }],
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({ ok: true }) } as Response;
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows active package balance with reserved count", async () => {
    render(<DoctorClientMembershipsPanel platformUserId={platformUserId} />);
    await waitFor(() => {
      expect(screen.getByText("Абонемент 5")).toBeTruthy();
    });
    expect(screen.getByText(/остаток 5/)).toBeTruthy();
    expect(screen.getByText(/зарезервировано 1/)).toBeTruthy();
    expect(screen.getByText("Назначить из каталога")).toBeTruthy();
    expect(screen.getByText("Индивидуальный абонемент")).toBeTruthy();
  });
});
