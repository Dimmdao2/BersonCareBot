import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
const getPoolMock = vi.hoisted(() => vi.fn(() => ({ query: queryMock })));

vi.mock("@/infra/db/client", () => ({
  getPool: getPoolMock,
}));

import { pgPatientBookingsPort } from "./pgPatientBookings";
import type { CreatePendingPatientBookingInput } from "@/modules/patient-booking/ports";

const SLOT_START = new Date("2026-05-01T10:00:00.000Z");
const SLOT_END = new Date("2026-05-01T11:00:00.000Z");
const NOW = new Date("2026-01-01T00:00:00.000Z");

function legacyRow(id: string): Record<string, unknown> {
  return {
    id,
    platform_user_id: "u1",
    booking_type: "in_person",
    city: "moscow",
    category: "general",
    slot_start: SLOT_START,
    slot_end: SLOT_END,
    status: "confirmed",
    cancelled_at: null,
    cancel_reason: null,
    rubitime_id: null,
    gcal_event_id: null,
    contact_phone: "+7000",
    contact_email: null,
    contact_name: "T",
    reminder_24h_sent: false,
    reminder_2h_sent: false,
    created_at: NOW,
    updated_at: NOW,
  };
}

function v2Row(id: string): Record<string, unknown> {
  return {
    ...legacyRow(id),
    branch_id: "br1",
    service_id: "sv1",
    branch_service_id: "bs1",
    city_code_snapshot: "moscow",
    branch_title_snapshot: "Филиал",
    service_title_snapshot: "Сеанс",
    duration_minutes_snapshot: 60,
    price_minor_snapshot: 100,
    rubitime_branch_id_snapshot: "173",
    rubitime_cooperator_id_snapshot: "347",
    rubitime_service_id_snapshot: "675",
  };
}

describe("pgPatientBookingsPort", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("createPending passes v2 snapshot columns to INSERT", async () => {
    queryMock.mockResolvedValueOnce({ rows: [v2Row("new-id")] });
    const input: CreatePendingPatientBookingInput = {
      userId: "u1",
      bookingType: "in_person",
      city: "moscow",
      category: "general",
      slotStart: SLOT_START.toISOString(),
      slotEnd: SLOT_END.toISOString(),
      contactName: "T",
      contactPhone: "+7000",
      contactEmail: null,
      branchId: "br1",
      serviceId: "sv1",
      branchServiceId: "bs1",
      cityCodeSnapshot: "moscow",
      branchTitleSnapshot: "Филиал",
      serviceTitleSnapshot: "Сеанс",
      durationMinutesSnapshot: 60,
      priceMinorSnapshot: 100,
      rubitimeBranchIdSnapshot: "173",
      rubitimeCooperatorIdSnapshot: "347",
      rubitimeServiceIdSnapshot: "675",
    };
    const row = await pgPatientBookingsPort.createPending(input);
    const sql = String(queryMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("branch_service_id");
    expect(sql).toContain("city_code_snapshot");
    expect(row.branchServiceId).toBe("bs1");
    expect(row.serviceTitleSnapshot).toBe("Сеанс");
  });

  it("listUpcomingByUser maps legacy row without v2 columns", async () => {
    queryMock.mockResolvedValueOnce({ rows: [legacyRow("leg-1")] });
    const rows = await pgPatientBookingsPort.listUpcomingByUser("u1", "2026-01-01T00:00:00.000Z");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.branchServiceId).toBeNull();
    expect(rows[0]!.serviceTitleSnapshot).toBeNull();
  });

  it("listUpcomingByUser maps v2 row with snapshots", async () => {
    queryMock.mockResolvedValueOnce({ rows: [v2Row("v2-1")] });
    const rows = await pgPatientBookingsPort.listUpcomingByUser("u1", "2026-01-01T00:00:00.000Z");
    expect(rows[0]!.branchServiceId).toBe("bs1");
    expect(rows[0]!.cityCodeSnapshot).toBe("moscow");
  });
});
