/**
 * Stage 8: SQL bind contract for webapp tables (same canonical instant as integrator S8.T02).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
const getPoolMock = vi.hoisted(() => vi.fn(() => ({ query: queryMock })));

vi.mock("@/infra/db/client", () => ({
  getPool: getPoolMock,
}));

vi.mock("@/infra/repos/rubitimeBranchServiceLookup", () => ({
  lookupBranchServiceByRubitimeIds: vi.fn(),
}));

import { createPgAppointmentProjectionPort } from "./pgAppointmentProjection";
import { pgPatientBookingsPort } from "./pgPatientBookings";

/** Moscow wall 11:00 → UTC (STAGE_8 / MASTER_PLAN). */
const STAGE8_EXPECTED_MOSCOW_UTC_ISO = "2026-04-07T08:00:00.000Z";

describe("Stage 8 timezone contract (webapp PG repos)", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("S8.T02: appointment_records — upsertRecordFromProjection binds record_at ($3) to canonical ISO", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const port = createPgAppointmentProjectionPort();
    await port.upsertRecordFromProjection({
      integratorRecordId: "stage8-contract-moscow",
      phoneNormalized: "+79990001122",
      recordAt: STAGE8_EXPECTED_MOSCOW_UTC_ISO,
      status: "updated",
      payloadJson: {},
      lastEvent: "event-update-record",
      updatedAt: "2026-04-07T08:00:00.000Z",
    });
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("appointment_records");
    expect(sql).toContain("record_at");
    expect(params[2]).toBe(STAGE8_EXPECTED_MOSCOW_UTC_ISO);
  });

  it("S8.T02: patient_bookings — createPending binds slot_start ($6) to canonical ISO", async () => {
    const slotEnd = "2026-04-07T09:00:00.000Z";
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "pb-stage8",
          platform_user_id: "u-stage8",
          booking_type: "in_person",
          city: "moscow",
          category: "general",
          slot_start: new Date(STAGE8_EXPECTED_MOSCOW_UTC_ISO),
          slot_end: new Date(slotEnd),
          status: "creating",
          cancelled_at: null,
          cancel_reason: null,
          rubitime_id: null,
          gcal_event_id: null,
          contact_phone: "+7000",
          contact_email: null,
          contact_name: "T",
          reminder_24h_sent: false,
          reminder_2h_sent: false,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    await pgPatientBookingsPort.createPending({
      userId: "u-stage8",
      bookingType: "in_person",
      city: "moscow",
      category: "general",
      slotStart: STAGE8_EXPECTED_MOSCOW_UTC_ISO,
      slotEnd,
      contactName: "T",
      contactPhone: "+7000",
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
    });
    expect(queryMock).toHaveBeenCalledTimes(1);
    const params = queryMock.mock.calls[0][1] as unknown[];
    expect(params[5]).toBe(STAGE8_EXPECTED_MOSCOW_UTC_ISO);
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain("patient_bookings");
    expect(sql).toContain("slot_start");
  });
});
