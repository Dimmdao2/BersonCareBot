import { describe, expect, it, vi } from "vitest";
import { createBookingOnCanonicalEngine } from "./canonicalCreate";

const BRANCH_ID = "550e8400-e29b-41d4-a716-446655440001";
const SERVICE_ID = "550e8400-e29b-41d4-a716-446655440002";
const ORG_ID = "22222222-2222-4222-8222-222222222222";

function deps() {
  const bookingsPort = {
    createPending: vi.fn().mockResolvedValue({ id: "booking-1", contactName: "Иван", contactPhone: "+79990001122", contactEmail: null }),
    markConfirmed: vi.fn().mockResolvedValue({ id: "booking-1", contactName: "Иван", contactPhone: "+79990001122", contactEmail: null, status: "confirmed" }),
    markFailedSync: vi.fn(),
  };
  const bookingEngine = {
    catalog: { getBranch: vi.fn().mockResolvedValue({ id: BRANCH_ID, organizationId: ORG_ID, isActive: true, cityCode: "moscow", title: "Москва" }) },
    services: { getService: vi.fn().mockResolvedValue({ id: SERVICE_ID, organizationId: ORG_ID, isActive: true, title: "Приём", durationMinutes: 60, priceMinor: 1000, bufferAfterMinutes: 0 }) },
    createAppointment: vi.fn().mockResolvedValue({ id: "appt-1" }),
  };
  const bookingScheduling = {
    resolveCanonicalInPersonContext: vi.fn().mockResolvedValue({ organizationId: ORG_ID, branchId: BRANCH_ID, serviceId: SERVICE_ID, specialistId: "sp-1", roomId: null, durationMinutes: 60, bufferAfterMinutes: 0, branchTimezone: "Europe/Moscow" }),
    assertSlotAvailable: vi.fn().mockResolvedValue(undefined),
    getMaxConsecutiveSlotHours: vi.fn().mockResolvedValue(24),
  };
  return { bookingsPort, bookingEngine, bookingScheduling, syncPort: { emitBookingEvent: vi.fn() } };
}

describe("createBookingOnCanonicalEngine", () => {
  it("creates a canonical appointment without writing a legacy patient_bookings link", async () => {
    const input = deps();
    await createBookingOnCanonicalEngine(input as never, {
      userId: "user-1", organizationId: ORG_ID, type: "in_person", branchId: BRANCH_ID, serviceId: SERVICE_ID, cityCode: "moscow",
      slotStart: "2026-06-01T10:00:00.000Z", slotEnd: "2026-06-01T11:00:00.000Z", contactName: "Иван", contactPhone: "+79990001122",
    });
    expect(input.bookingScheduling.resolveCanonicalInPersonContext).toHaveBeenCalledWith({ organizationId: ORG_ID, branchId: BRANCH_ID, serviceId: SERVICE_ID });
    expect(input.bookingsPort.createPending).toHaveBeenCalledWith(expect.objectContaining({ branchId: null, serviceId: null, branchServiceId: null }));
    expect(input.bookingEngine.createAppointment).toHaveBeenCalledWith(expect.objectContaining({ branchId: BRANCH_ID, serviceId: SERVICE_ID }));
  });
});
