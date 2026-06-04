/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PatientPackageSessionsList } from "./PatientPackageSessionsList";

describe("PatientPackageSessionsList", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/sessions")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            sessions: [
              {
                appointmentId: "appt-1",
                startsAt: "2026-07-01T10:00:00Z",
                endsAt: null,
                status: "confirmed",
                branchTitle: "Клиника",
                serviceTitle: "ЛФК",
                serviceId: "svc-1",
                linkage: "consumed",
                mappingStatus: "ok",
                isPast: false,
                actions: {
                  canUnlinkReserve: false,
                  canRefundConsumed: true,
                  canManualConsume: false,
                  canOpenInCalendar: true,
                },
              },
            ],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({ ok: true }) } as Response;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows refund-specific confirm text", async () => {
    const user = userEvent.setup();
    render(
      <PatientPackageSessionsList
        packageId="pkg-1"
        apiBase="/api/doctor/booking-engine/patient-packages"
      />,
    );
    await user.click(await screen.findByRole("button", { name: "Вернуть сеанс" }));
    expect(screen.getByText("Вернуть списанный сеанс в абонемент?")).toBeTruthy();
  });
});
