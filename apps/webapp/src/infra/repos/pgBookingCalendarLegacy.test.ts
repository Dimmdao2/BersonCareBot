import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
}));

import { CANCELLATION_LAST_EVENT_EXCLUSION_SQL } from "./pgDoctorAppointments";
import { createPgBookingCalendarLegacyPort } from "./pgBookingCalendarLegacy";

describe("createPgBookingCalendarLegacyPort", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it("listAppointmentsInRange uses range overlap and booking-engine dedupe SQL", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgBookingCalendarLegacyPort();
    await port.listAppointmentsInRange({
      rangeStart: "2026-06-01T00:00:00.000Z",
      rangeEnd: "2026-06-08T00:00:00.000Z",
    });

    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("be_external_entity_mappings");
    expect(sql).toContain("integrator_record_id LIKE 'be:%'");
    expect(sql).toContain(CANCELLATION_LAST_EVENT_EXCLUSION_SQL);
    expect(sql).toContain("record_at < $2::timestamptz");
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual([
      "2026-06-01T00:00:00.000Z",
      "2026-06-08T00:00:00.000Z",
      expect.any(Number),
    ]);
  });
});
