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
        legacyBranchId: "legacy-branch-1",
      },
    );
    expect(upsertRecordFromProjection).toHaveBeenCalledWith(
      expect.objectContaining({
        integratorRecordId: "8442451",
        status: "canceled",
        lastEvent: "native.cancelled",
        branchId: "legacy-branch-1",
      }),
    );
  });

  it("cancel projection ignores be_branches id on appointment", async () => {
    const upsertRecordFromProjection = vi.fn().mockResolvedValue(undefined);
    await projectCanonicalAppointmentCancelled(
      { upsertRecordFromProjection } as never,
      {
        id: "appt-1",
        startAt: "2026-06-13T09:00:00.000Z",
        endAt: "2026-06-13T10:00:00.000Z",
        branchId: "be-branch-wrong",
        phoneNormalized: "+79189000782",
      } as never,
      {
        phoneNormalized: "+79189000782",
        contactName: "Test",
        serviceTitle: "Сеанс",
        branchTitle: "СПб",
        rubitimeRecordId: "8442451",
        legacyBranchId: null,
      },
    );
    expect(upsertRecordFromProjection).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: null }),
    );
  });
});
