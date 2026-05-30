import { describe, expect, it } from "vitest";
import { legacyRecordDurationMinutes, mapLegacyRecordToCalendarEvent } from "./mapLegacyRecordToCalendarEvent";

describe("mapLegacyRecordToCalendarEvent", () => {
  it("maps record_at and default 60 min duration to endAt", () => {
    const event = mapLegacyRecordToCalendarEvent({
      integrator_record_id: "rt-1",
      phone_normalized: "+79001234567",
      record_at: new Date("2026-05-30T10:00:00.000Z"),
      status: "created",
      payload_json: { service_title: "Приём", name: "Иван" },
      user_id: "user-1",
      display_name: null,
      branch_name: "Центр",
      branch_id: "legacy-branch-1",
      mapped_be_branch_id: "be-branch-1",
    });
    expect(event).not.toBeNull();
    expect(event!.startAt).toBe("2026-05-30T10:00:00.000Z");
    expect(event!.endAt).toBe("2026-05-30T11:00:00.000Z");
    expect(event!.source).toBe("rubitime_legacy");
    expect(event!.branchId).toBe("be-branch-1");
    expect(event!.patientName).toBe("Иван");
    expect(event!.serviceTitle).toBe("Приём");
  });

  it("uses payload duration when present", () => {
    expect(legacyRecordDurationMinutes({ duration_minutes: 90 })).toBe(90);
    const event = mapLegacyRecordToCalendarEvent({
      integrator_record_id: "rt-2",
      phone_normalized: null,
      record_at: new Date("2026-05-30T10:00:00.000Z"),
      status: "updated",
      payload_json: { durationMinutes: 30 },
      user_id: null,
      display_name: "Петр",
      branch_name: null,
      branch_id: null,
      mapped_be_branch_id: null,
    });
    expect(event!.endAt).toBe("2026-05-30T10:30:00.000Z");
  });

  it("returns null for canceled records", () => {
    expect(
      mapLegacyRecordToCalendarEvent({
        integrator_record_id: "rt-3",
        phone_normalized: null,
        record_at: new Date("2026-05-30T10:00:00.000Z"),
        status: "canceled",
        payload_json: null,
        user_id: null,
        display_name: null,
        branch_name: null,
        branch_id: null,
        mapped_be_branch_id: null,
      }),
    ).toBeNull();
  });
});
