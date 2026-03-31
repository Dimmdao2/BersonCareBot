import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryPatientBookingsPort, resetInMemoryPatientBookingsStore } from "./inMemoryPatientBookings";

describe("inMemoryPatientBookingsPort slot overlap", () => {
  beforeEach(() => {
    resetInMemoryPatientBookingsStore();
  });

  const baseInput = {
    userId: "00000000-0000-4000-8000-000000000001",
    type: "online" as const,
    category: "general" as const,
    slotStart: "2026-04-02T10:00:00.000Z",
    slotEnd: "2026-04-02T11:00:00.000Z",
    contactName: "A",
    contactPhone: "+79990001122",
  };

  it("createPending rejects overlap with confirmed booking", async () => {
    const first = await inMemoryPatientBookingsPort.createPending(baseInput);
    await inMemoryPatientBookingsPort.markConfirmed(first.id, "r1");
    await expect(
      inMemoryPatientBookingsPort.createPending({
        ...baseInput,
        userId: "00000000-0000-4000-8000-000000000002",
        slotStart: "2026-04-02T10:30:00.000Z",
        slotEnd: "2026-04-02T11:30:00.000Z",
      }),
    ).rejects.toThrow("slot_overlap");
  });

  it("markConfirmed rejects overlap once the other row is confirmed", async () => {
    const a = await inMemoryPatientBookingsPort.createPending(baseInput);
    const b = await inMemoryPatientBookingsPort.createPending({
      ...baseInput,
      userId: "00000000-0000-4000-8000-000000000002",
      slotStart: "2026-04-02T10:30:00.000Z",
      slotEnd: "2026-04-02T11:30:00.000Z",
    });
    await inMemoryPatientBookingsPort.markConfirmed(a.id, "r1");
    await expect(inMemoryPatientBookingsPort.markConfirmed(b.id, "r2")).rejects.toThrow("slot_overlap");
  });
});
