/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import {
  buildRescheduleHref,
  CabinetBookingActions,
  classifyPatientBookingReschedule,
} from "./CabinetBookingActions";
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
    canonicalAppointmentId: "00000000-0000-4000-8000-0000000000a1",
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

  it("uses the new canonical in-person context for the reschedule navigation", () => {
    const row = sampleRow({
      bookingType: "in_person",
      branchId: "legacy-branch-id",
      serviceId: "legacy-service-id",
      branchServiceId: "legacy-branch-service-id",
      cityCodeSnapshot: "moscow",
      serviceTitleSnapshot: "Legacy service",
      canonicalInPersonContext: {
        branchId: "00000000-0000-4000-8000-0000000000b1",
        serviceId: "00000000-0000-4000-8000-0000000000c1",
        cityCode: "spb",
        branchTitle: "Клиника",
        serviceTitle: "Каноническая услуга",
        durationMinutes: 45,
        priceMinor: 250000,
      },
    });

    expect(classifyPatientBookingReschedule(row)).toBe("canonical_in_person");
    expect(buildRescheduleHref(row)).toBe(
      "/app/patient/booking/slot?type=in_person&branchId=00000000-0000-4000-8000-0000000000b1&serviceId=00000000-0000-4000-8000-0000000000c1&rescheduleBookingId=550e8400-e29b-41d4-a716-446655440001",
    );
    render(<CabinetBookingActions row={row} />);
    expect(screen.getByRole("link", { name: "Перенести" })).toHaveAttribute(
      "href",
      expect.stringContaining("branchId=00000000-0000-4000-8000-0000000000b1"),
    );
    expect(screen.getByRole("link", { name: "Перенести" })).not.toHaveAttribute(
      "href",
      expect.stringContaining("legacy-branch-id"),
    );
  });

  it("allows a linked historical row only through its proven canonical context", () => {
    const row = sampleRow({
      bookingType: "in_person",
      bookingSource: "imported",
      canonicalInPersonContext: {
        branchId: "00000000-0000-4000-8000-0000000000b2",
        serviceId: "00000000-0000-4000-8000-0000000000c2",
        cityCode: "moscow",
        branchTitle: "Клиника",
        serviceTitle: "Приём",
        durationMinutes: 60,
        priceMinor: 0,
      },
    });

    expect(classifyPatientBookingReschedule(row)).toBe("canonical_in_person");
    render(<CabinetBookingActions row={row} />);
    expect(screen.getByRole("link", { name: "Перенести" })).toHaveAttribute(
      "href",
      expect.stringContaining("branchId=00000000-0000-4000-8000-0000000000b2"),
    );
    expect(screen.getByRole("link", { name: "Перенести" })).toHaveAttribute(
      "href",
      expect.stringContaining("serviceId=00000000-0000-4000-8000-0000000000c2"),
    );
  });

  it("fails closed for incomplete legacy-only rows while retaining canonical online navigation", () => {
    const legacyOnly = sampleRow({
      bookingType: "in_person",
      canonicalAppointmentId: null,
      branchId: "00000000-0000-4000-8000-0000000000d1",
      serviceId: "00000000-0000-4000-8000-0000000000e1",
      branchServiceId: "00000000-0000-4000-8000-0000000000f1",
    });
    const incompleteCanonical = sampleRow({ bookingType: "in_person", canonicalInPersonContext: null });
    const online = sampleRow({ bookingType: "online" });

    expect(classifyPatientBookingReschedule(legacyOnly)).toBe("legacy_only");
    expect(buildRescheduleHref(legacyOnly)).toBeNull();
    expect(classifyPatientBookingReschedule(incompleteCanonical)).toBe("canonical_in_person_incomplete");
    expect(buildRescheduleHref(incompleteCanonical)).toBeNull();
    expect(classifyPatientBookingReschedule(online)).toBe("canonical_online");
    expect(buildRescheduleHref(online)).toContain("type=online");
    const { rerender } = render(<CabinetBookingActions row={legacyOnly} />);
    expect(screen.queryByRole("link", { name: "Перенести" })).not.toBeInTheDocument();
    rerender(<CabinetBookingActions row={incompleteCanonical} />);
    expect(screen.queryByRole("link", { name: "Перенести" })).not.toBeInTheDocument();
    rerender(<CabinetBookingActions row={online} />);
    expect(screen.getByRole("link", { name: "Перенести" })).toHaveAttribute(
      "href",
      expect.stringContaining("type=online"),
    );
  });
});
