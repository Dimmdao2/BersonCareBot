import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const queryMock = vi.hoisted(() => vi.fn());
const getPoolMock = vi.hoisted(() => vi.fn(() => ({ query: queryMock })));

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
}));

vi.mock("@/infra/db/client", () => ({
  getPool: getPoolMock,
}));

import { mapRubitimeStatusToPatientBookingStatus, pgPatientBookingsPort } from "./pgPatientBookings";
import type { CreatePendingPatientBookingInput } from "@/modules/patient-booking/ports";

const SLOT_START = new Date("2026-05-01T10:00:00.000Z");
const SLOT_END = new Date("2026-05-01T11:00:00.000Z");
const NOW = new Date("2026-01-01T00:00:00.000Z");

function legacyRow(id: string): Record<string, unknown> {
  return {
    id,
    rubitime_manage_url: null,
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

const LOOKUP_FULL = {
  branch_service_id: "00000000-0000-4000-8000-0000000000b1",
  branch_id: "00000000-0000-4000-8000-0000000000b2",
  service_id: "00000000-0000-4000-8000-0000000000b3",
  city_code: "moscow",
  branch_title: "Ф-1",
  service_title: "Услуга",
  duration_minutes: 60,
  price_minor: 100,
  rubitime_cooperator_id: "99",
} as const;

function lookupQueryResult() {
  return { rows: [LOOKUP_FULL] };
}

const baseCompatInput = {
  rubitimeId: "rt-upsert-1",
  status: "confirmed" as const,
  slotStart: SLOT_START.toISOString(),
  slotEnd: null as string | null,
  userId: null as string | null,
  contactPhone: "+7000",
  contactName: "X",
  branchTitle: null as string | null,
  serviceTitle: null as string | null,
  rubitimeBranchId: "173",
  rubitimeServiceId: "675",
  rubitimeCooperatorId: "99",
};

describe("pgPatientBookingsPort", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    queryMock.mockReset();
  });

  it("createPending passes v2 snapshot columns to INSERT", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rows: [v2Row("new-id")] });
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
    const reconcileSql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    const insertSql = String(runWebappPgTextMock.mock.calls[1]?.[0] ?? "");
    expect(reconcileSql).toContain("failed_sync");
    expect(insertSql).toContain("branch_service_id");
    expect(insertSql).toContain("city_code_snapshot");
    expect(row.branchServiceId).toBe("bs1");
    expect(row.serviceTitleSnapshot).toBe("Сеанс");
  });

  it("createPending throws slot_overlap when INSERT returns no row (overlap pre-check)", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rowCount: 0 }).mockResolvedValueOnce({ rows: [] });
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
    await expect(pgPatientBookingsPort.createPending(input)).rejects.toThrow("slot_overlap");
  });

  it("createPending SQL scopes overlap by specialist or user fallback", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rows: [v2Row("new-id-2")] });
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
    await pgPatientBookingsPort.createPending(input);
    const insertSql = String(runWebappPgTextMock.mock.calls[1]?.[0] ?? "");
    expect(insertSql).toContain("rubitime_cooperator_id_snapshot = $20");
    expect(insertSql).toContain("platform_user_id = $2");
    expect(insertSql).toContain("canonical_appointment_id IS NULL");
  });

  it("createPending excludes abandoned native creating rows from overlap", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rows: [v2Row("retry-id")] });
    const input: CreatePendingPatientBookingInput = {
      userId: "u1",
      bookingType: "in_person",
      city: "spb",
      category: "general",
      slotStart: SLOT_START.toISOString(),
      slotEnd: SLOT_END.toISOString(),
      contactName: "T",
      contactPhone: "+7000",
      contactEmail: null,
      branchId: "br1",
      serviceId: "sv1",
      branchServiceId: "bs1",
      cityCodeSnapshot: "spb",
      branchTitleSnapshot: "Филиал",
      serviceTitleSnapshot: "Сеанс",
      durationMinutesSnapshot: 60,
      priceMinorSnapshot: 100,
      rubitimeBranchIdSnapshot: "173",
      rubitimeCooperatorIdSnapshot: "347",
      rubitimeServiceIdSnapshot: "675",
    };
    await pgPatientBookingsPort.createPending(input);
    const reconcileSql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(reconcileSql).toContain("status = 'creating'");
    expect(reconcileSql).toContain("failed_sync");
  });

  it("listUpcomingByUser maps legacy row without v2 columns", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [legacyRow("leg-1")] });
    const rows = await pgPatientBookingsPort.listUpcomingByUser("u1", "2026-01-01T00:00:00.000Z");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.branchServiceId).toBeNull();
    expect(rows[0]!.serviceTitleSnapshot).toBeNull();
  });

  it("listUpcomingByUser maps v2 row with snapshots", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [v2Row("v2-1")] });
    const rows = await pgPatientBookingsPort.listUpcomingByUser("u1", "2026-01-01T00:00:00.000Z");
    expect(rows[0]!.branchServiceId).toBe("bs1");
    expect(rows[0]!.cityCodeSnapshot).toBe("moscow");
  });

  it("listUpcomingByUser filters stale creating duplicates against finalized rows", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    await pgPatientBookingsPort.listUpcomingByUser("u1", "2026-01-01T00:00:00.000Z");
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("status = 'creating'");
    expect(sql).toContain("canonical_appointment_id IS NULL");
    expect(sql).toContain("COALESCE(newer.category, '') = COALESCE(patient_bookings.category, '')");
  });

  it("listHistoryByUser returns mixed legacy and v2 rows (dual-read history)", async () => {
    const leg = legacyRow("leg-h");
    const v2 = v2Row("v2-h");
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [v2, leg] });
    const rows = await pgPatientBookingsPort.listHistoryByUser("u1", "2026-06-01T00:00:00.000Z");
    expect(rows).toHaveLength(2);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId["leg-h"]!.branchServiceId).toBeNull();
    expect(byId["leg-h"]!.city).toBe("moscow");
    expect(byId["v2-h"]!.branchServiceId).toBe("bs1");
    expect(byId["v2-h"]!.serviceTitleSnapshot).toBe("Сеанс");
  });

  describe("upsertFromRubitime (F-04 compat-sync)", () => {
    beforeEach(() => {
      queryMock.mockReset();
    });

    it("native row update keeps slot timestamps guarded by source=rubitime_projection", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "native-id-1", source: "native", slot_start: SLOT_START, status: "confirmed", canonical_appointment_id: null }],
      });
      queryMock.mockResolvedValueOnce({ rowCount: 1 });

      await pgPatientBookingsPort.upsertFromRubitime({
        ...baseCompatInput,
        rubitimeId: "rt-native-keep-slot",
        slotStart: "2026-05-01 11:00:00",
        slotEnd: "2026-05-01 12:00:00",
        rubitimeBranchId: null,
        rubitimeServiceId: null,
      });

      const updateSql = String(queryMock.mock.calls[1]?.[0] ?? "");
      expect(updateSql).toContain("WHEN source = 'rubitime_projection' THEN COALESCE($3::timestamptz, slot_start)");
      expect(updateSql).toContain("WHEN source = 'rubitime_projection' THEN COALESCE($4::timestamptz, slot_end)");
    });

    it("compat create writes branch_service_id and compat_quality full when catalog lookup succeeds", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce(lookupQueryResult())
        .mockResolvedValueOnce({ rowCount: 1 });

      await pgPatientBookingsPort.upsertFromRubitime(baseCompatInput);

      const insertArgs = queryMock.mock.calls[3]![1] as unknown[];
      expect(insertArgs![16]).toBe(LOOKUP_FULL.branch_service_id);
      expect(insertArgs![20]).toBe("full");
    });

    it("compat cancelled removes projection row by rubitime_id", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce(lookupQueryResult())
        .mockResolvedValueOnce({ rowCount: 1 });
      await pgPatientBookingsPort.upsertFromRubitime(baseCompatInput);

      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "00000000-0000-4000-8000-0000000000e1",
            source: "rubitime_projection",
            slot_start: SLOT_START,
            status: "confirmed",
            canonical_appointment_id: null,
          },
        ],
      });
      queryMock.mockResolvedValueOnce({ rowCount: 1 });
      await pgPatientBookingsPort.upsertFromRubitime({
        ...baseCompatInput,
        status: "cancelled",
      });

      const deleteSql = String(queryMock.mock.calls[5]![0] ?? "");
      expect(deleteSql).toContain("DELETE FROM");
      expect(queryMock.mock.calls.length).toBe(6);
    });

    it("compat cancelled without existing row does not create projection row", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      await pgPatientBookingsPort.upsertFromRubitime({
        ...baseCompatInput,
        status: "cancelled",
      });

      expect(queryMock.mock.calls.length).toBe(2);
      const insertAttempt = queryMock.mock.calls.find((call) => String(call[0]).includes("INSERT INTO"));
      expect(insertAttempt).toBeUndefined();
    });

    it("fallback links native row by phone + slot when rubitime_id was NULL, then UPDATE path", async () => {
      const nativeId = "00000000-0000-4000-8000-0000000000n1";
      queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: nativeId, source: "native", slot_start: SLOT_START, status: "confirmed", canonical_appointment_id: null }],
        })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce(lookupQueryResult())
        .mockResolvedValueOnce({ rowCount: 1 });

      await pgPatientBookingsPort.upsertFromRubitime({
        ...baseCompatInput,
        rubitimeId: "rt-webhook-new",
        contactPhone: "+7000",
      });

      const linkSql = String(queryMock.mock.calls[2]?.[0] ?? "");
      expect(linkSql).toContain("rubitime_id = $1");
      expect((queryMock.mock.calls[2]?.[1] as unknown[])[0]).toBe("rt-webhook-new");
      expect((queryMock.mock.calls[2]?.[1] as unknown[])[1]).toBe(nativeId);
      const updateSql = String(queryMock.mock.calls[4]?.[0] ?? "");
      expect(updateSql).toContain("UPDATE");
    });

    it("does not revive cancelled native row from inbound confirmed upsert", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "native-cancelled",
            source: "native",
            slot_start: SLOT_START,
            status: "cancelled",
            canonical_appointment_id: null,
          },
        ],
      });

      await pgPatientBookingsPort.upsertFromRubitime({
        ...baseCompatInput,
        status: "confirmed",
      });

      expect(queryMock.mock.calls.length).toBe(1);
    });

    it("does not revive when canonical appointment is in terminal cancelled state", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "native-linked",
            source: "native",
            slot_start: SLOT_START,
            status: "confirmed",
            canonical_appointment_id: "appt-terminal",
          },
        ],
      });
      queryMock.mockResolvedValueOnce({
        rows: [{ status: "cancelled_by_patient" }],
      });

      await pgPatientBookingsPort.upsertFromRubitime({
        ...baseCompatInput,
        status: "confirmed",
      });

      expect(queryMock.mock.calls.length).toBe(2);
      const updateAttempt = queryMock.mock.calls.find((call) => String(call[0]).includes("UPDATE patient_bookings"));
      expect(updateAttempt).toBeUndefined();
    });

    it("lookup miss yields minimal compat_quality without branch_service_id", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await pgPatientBookingsPort.upsertFromRubitime({
        ...baseCompatInput,
        rubitimeId: "rt-miss-1",
        slotEnd: "2026-05-01T11:00:00.000Z",
        branchTitle: null,
        serviceTitle: null,
      });

      const insertArgs = queryMock.mock.calls[3]![1] as unknown[];
      expect(insertArgs![16]).toBeNull();
      expect(insertArgs![20]).toBe("minimal");
    });
  });
});

describe("markConfirmedByCanonicalAppointment", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it("keeps existing rubitime_id when confirm passes null rubitimeId", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        {
          ...legacyRow("pb-await"),
          status: "confirmed",
          rubitime_id: "rt-kept",
          canonical_appointment_id: "appt-1",
        },
      ],
    });
    const row = await pgPatientBookingsPort.markConfirmedByCanonicalAppointment("appt-1", null);
    expect(row?.rubitimeId).toBe("rt-kept");
    const updateSql = runWebappPgTextMock.mock.calls.map((c) => String(c[0])).find((s) => s.includes("UPDATE patient_bookings"));
    expect(updateSql).toContain("rubitime_id = COALESCE($2, rubitime_id)");
  });
});

describe("markConfirmed", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it("updates status and optional canonical_appointment_id", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ ...legacyRow("pb-1"), status: "confirmed", rubitime_id: "rt-1" }],
    });
    const row = await pgPatientBookingsPort.markConfirmed("pb-1", "rt-1", {
      canonicalAppointmentId: "00000000-0000-4000-8000-000000000001",
    });
    expect(row?.status).toBe("confirmed");
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("canonical_appointment_id = COALESCE");
  });
});

describe("getById", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it("returns null when booking missing", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    expect(await pgPatientBookingsPort.getById("missing")).toBeNull();
  });
});

describe("markFailedSync", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it("sets status failed_sync", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    await pgPatientBookingsPort.markFailedSync("pb-fail");
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("status = 'failed_sync'");
  });
});

describe("mapRubitimeStatusToPatientBookingStatus", () => {
  it("maps Russian cancelled labels", () => {
    expect(mapRubitimeStatusToPatientBookingStatus("Отменен клиентом")).toBe("cancelled");
  });

  it("maps latin canceled", () => {
    expect(mapRubitimeStatusToPatientBookingStatus("canceled")).toBe("cancelled");
  });
});
