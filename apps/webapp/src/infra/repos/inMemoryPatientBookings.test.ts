import { beforeEach, describe, expect, it } from "vitest";
import type { CreatePendingPatientBookingInput } from "@/modules/patient-booking/ports";
import { inMemoryPatientBookingsPort, resetInMemoryPatientBookingsStore } from "./inMemoryPatientBookings";

function onlinePending(over: Partial<CreatePendingPatientBookingInput> = {}): CreatePendingPatientBookingInput {
  return {
    userId: "00000000-0000-4000-8000-000000000001",
    bookingType: "online",
    city: null,
    category: "general",
    slotStart: "2026-04-02T10:00:00.000Z",
    slotEnd: "2026-04-02T11:00:00.000Z",
    contactName: "A",
    contactPhone: "+79990001122",
    contactEmail: null,
    branchId: null,
    serviceId: null,
    branchServiceId: null,
    cityCodeSnapshot: null,
    branchTitleSnapshot: null,
    serviceTitleSnapshot: null,
    durationMinutesSnapshot: null,
    priceMinorSnapshot: null,
    rubitimeBranchIdSnapshot: null,
    rubitimeCooperatorIdSnapshot: null,
    rubitimeServiceIdSnapshot: null,
    ...over,
  };
}

describe("inMemoryPatientBookingsPort slot overlap", () => {
  beforeEach(() => {
    resetInMemoryPatientBookingsStore();
  });

  it("createPending rejects overlap with confirmed booking", async () => {
    const first = await inMemoryPatientBookingsPort.createPending(onlinePending());
    await inMemoryPatientBookingsPort.markConfirmed(first.id, "r1");
    await expect(
      inMemoryPatientBookingsPort.createPending(
        onlinePending({
          userId: "00000000-0000-4000-8000-000000000002",
          slotStart: "2026-04-02T10:30:00.000Z",
          slotEnd: "2026-04-02T11:30:00.000Z",
        }),
      ),
    ).rejects.toThrow("slot_overlap");
  });

  it("markConfirmed rejects overlap once the other row is confirmed", async () => {
    const a = await inMemoryPatientBookingsPort.createPending(onlinePending());
    const b = await inMemoryPatientBookingsPort.createPending(
      onlinePending({
        userId: "00000000-0000-4000-8000-000000000002",
        slotStart: "2026-04-02T10:30:00.000Z",
        slotEnd: "2026-04-02T11:30:00.000Z",
      }),
    );
    await inMemoryPatientBookingsPort.markConfirmed(a.id, "r1");
    await expect(inMemoryPatientBookingsPort.markConfirmed(b.id, "r2")).rejects.toThrow("slot_overlap");
  });
});
