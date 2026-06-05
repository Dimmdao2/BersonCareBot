import { describe, expect, it, vi } from "vitest";
import { projectCanonicalAppointmentCancelled } from "./projectCanonicalAppointment";

describe("projectCanonicalAppointment", () => {
  it("cancel projection uses appointment_records status canceled (not cancelled)", async () => {
    const upsertRecordFromProjection = vi.fn().mockResolvedValue(undefined);
    await projectCanonicalAppointmentCancelled(
      { upsertRecordFromProjection } as never,
      {
        id: "appt-1",
        startAt: "2026-06-13T09:00:00.000Z",
        endAt: "2026-06-13T10:00:00.000Z",
        branchId: "branch-1",
        phoneNormalized: "+79189000782",
      } as never,
      {
        phoneNormalized: "+79189000782",
        contactName: "Test",
        serviceTitle: "Сеанс",
        branchTitle: "СПб",
        rubitimeRecordId: "8442451",
      },
    );
    expect(upsertRecordFromProjection).toHaveBeenCalledWith(
      expect.objectContaining({
        integratorRecordId: "8442451",
        status: "canceled",
        lastEvent: "native.cancelled",
      }),
    );
  });
});
