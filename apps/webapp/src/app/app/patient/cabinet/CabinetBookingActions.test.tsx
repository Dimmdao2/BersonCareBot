/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import { CabinetBookingActions } from "./CabinetBookingActions";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";

const refresh = vi.fn();
const partialToast = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock("@/shared/booking/bookingPartialOutcomeToast", () => ({
  parsePatientBookingPartialOutcome: (json: Record<string, unknown>) =>
    json.rubitimeMirrorFailed === true ? { rubitimeMirrorFailed: true as const } : undefined,
  showBookingPartialOutcomeToast: (...args: unknown[]) => partialToast(...args),
}));

function sampleRow(overrides: Partial<PatientBookingRecord> = {}): PatientBookingRecord {
  return {
    id: "550e8400-e29b-41d4-a716-446655440001",
    userId: "user-1",
    bookingType: "online",
    city: null,
    category: "general",
    slotStart: "2026-06-10T10:00:00.000Z",
    slotEnd: "2026-06-10T11:00:00.000Z",
    status: "confirmed",
    cancelledAt: null,
    cancelReason: null,
    rubitimeId: "r1",
    gcalEventId: null,
    contactPhone: "+79001234567",
    contactEmail: null,
    contactName: "Иван",
    reminder24hSent: false,
    reminder2hSent: false,
    createdAt: "",
    updatedAt: "",
    branchServiceId: null,
    branchId: null,
    serviceId: null,
    cityCodeSnapshot: null,
    branchTitleSnapshot: null,
    serviceTitleSnapshot: null,
    durationMinutesSnapshot: 60,
    priceMinorSnapshot: null,
    rubitimeBranchIdSnapshot: null,
    rubitimeCooperatorIdSnapshot: null,
    rubitimeServiceIdSnapshot: null,
    rubitimeManageUrl: null,
    canonicalAppointmentId: "appt-1",
    bookingSource: "native",
    compatQuality: null,
    provenanceCreatedBy: null,
    provenanceUpdatedBy: null,
    ...overrides,
  };
}

describe("CabinetBookingActions", () => {
  beforeEach(() => {
    refresh.mockClear();
    partialToast.mockClear();
    vi.mocked(toast.success).mockClear();
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, cancel: { ok: true, allowed: true } }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, rubitimeMirrorFailed: true }),
        } as Response),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows partial outcome toast after successful cancel with rubitime mirror failure", async () => {
    const user = userEvent.setup();
    render(<CabinetBookingActions row={sampleRow()} />);

    await user.click(screen.getByRole("button", { name: /Отменить/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Запись отменена");
      expect(partialToast).toHaveBeenCalledWith({ rubitimeMirrorFailed: true });
      expect(refresh).toHaveBeenCalled();
    });
  });
});
