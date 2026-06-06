import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  findExistingPatientBookingForRubitime,
  upsertPatientBookingFromRubitime,
} from "./upsertPatientBookingFromRubitime.js";
import type { SqlExecutor } from "./sql.js";

const LOOKUP_ROW = {
  branch_service_id: "00000000-0000-4000-8000-0000000000b1",
  branch_id: "00000000-0000-4000-8000-0000000000b2",
  service_id: "00000000-0000-4000-8000-0000000000b3",
  city_code: "moscow",
  branch_title: "Ф-1",
  service_title: "Услуга",
  duration_minutes: 60,
  price_minor: 100,
  rubitime_cooperator_id: "99",
};

function createDbMock() {
  const query = vi.fn();
  const db: SqlExecutor = { query };
  return { db, query };
}

const normalizePhone = (raw: string) => raw;

describe("upsertPatientBookingFromRubitime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates rubitime_projection row when no existing match", async () => {
    const { db, query } = createDbMock();
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [LOOKUP_ROW] })
      .mockResolvedValueOnce({ rowCount: 1 });

    await upsertPatientBookingFromRubitime(db, normalizePhone, {
      rubitimeId: "rt-new",
      status: "confirmed",
      slotStart: "2026-05-01T10:00:00.000Z",
      contactPhone: "+7000",
      contactName: "X",
      rubitimeBranchId: "173",
      rubitimeServiceId: "675",
      rubitimeCooperatorId: "99",
    });

    const insertSql = String(query.mock.calls.at(-1)?.[0] ?? "");
    expect(insertSql).toContain("INSERT INTO public.patient_bookings");
    expect(insertSql).toContain("ON CONFLICT (rubitime_id) DO NOTHING");
  });

  it("deletes rubitime_projection on cancelled status", async () => {
    const { db, query } = createDbMock();
    const existingRow = {
      id: "proj-1",
      source: "rubitime_projection",
      slot_start: new Date("2026-05-01T10:00:00.000Z"),
      status: "confirmed",
      canonical_appointment_id: null,
    };

    query.mockResolvedValueOnce({ rowCount: 1 });

    await upsertPatientBookingFromRubitime(
      db,
      normalizePhone,
      { rubitimeId: "rt-del", status: "cancelled", slotStart: "2026-05-01T10:00:00.000Z" },
      { existingRow },
    );

    expect(String(query.mock.calls[0]?.[0])).toContain("DELETE FROM public.patient_bookings");
  });

  it("findExisting links native row by phone and slot", async () => {
    const { db, query } = createDbMock();
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "native-1",
            source: "native",
            slot_start: new Date("2026-05-01T10:00:00.000Z"),
            status: "confirmed",
            canonical_appointment_id: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1 });

    const row = await findExistingPatientBookingForRubitime(db, normalizePhone, {
      rubitimeId: "rt-link",
      status: "confirmed",
      slotStart: "2026-05-01T10:00:00.000Z",
      contactPhone: "+7000",
    });

    expect(row?.id).toBe("native-1");
    expect(String(query.mock.calls[2]?.[0])).toContain("UPDATE public.patient_bookings SET rubitime_id");
  });

  it("native cancelled clears rubitime_manage_url", async () => {
    const { db, query } = createDbMock();
    const existingRow = {
      id: "native-cancel",
      source: "native",
      slot_start: new Date("2026-05-01T10:00:00.000Z"),
      status: "confirmed",
      canonical_appointment_id: "appt-1",
    };
    query.mockResolvedValueOnce({ rowCount: 1 });

    await upsertPatientBookingFromRubitime(
      db,
      normalizePhone,
      {
        rubitimeId: "rt-native-cancel",
        status: "cancelled",
        slotStart: "2026-05-01T10:00:00.000Z",
        rubitimeManageUrl: "https://rubitime.ru/manage/123",
      },
      { existingRow },
    );

    const updateSql = String(query.mock.calls[0]?.[0] ?? "");
    expect(updateSql).toContain("WHEN $2::text = 'cancelled' THEN NULL");
    const params = query.mock.calls[0]?.[1] as unknown[];
    expect(params?.[1]).toBe("cancelled");
  });

  it("native cancelled closes active sibling rows with same rubitime_id", async () => {
    const { db, query } = createDbMock();
    const existingRow = {
      id: "native-primary",
      source: "native",
      slot_start: new Date("2026-05-01T10:00:00.000Z"),
      status: "confirmed",
      canonical_appointment_id: "appt-1",
    };
    query.mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 1 });

    await upsertPatientBookingFromRubitime(
      db,
      normalizePhone,
      { rubitimeId: "rt-dup", status: "cancelled", slotStart: "2026-05-01T10:00:00.000Z" },
      { existingRow },
    );

    expect(String(query.mock.calls[1]?.[0])).toContain("rubitime_id = $1");
    expect(String(query.mock.calls[1]?.[0])).toContain("rubitime_manage_url = NULL");
  });

  it("updates existing rubitime_projection row", async () => {
    const { db, query } = createDbMock();
    const existingRow = {
      id: "proj-upd",
      source: "rubitime_projection",
      slot_start: new Date("2026-05-01T10:00:00.000Z"),
      status: "confirmed",
      canonical_appointment_id: null,
    };
    query.mockResolvedValueOnce({ rows: [LOOKUP_ROW] }).mockResolvedValueOnce({ rowCount: 1 });

    await upsertPatientBookingFromRubitime(
      db,
      normalizePhone,
      {
        rubitimeId: "rt-upd",
        status: "rescheduled",
        slotStart: "2026-05-01T11:00:00.000Z",
        rubitimeBranchId: "173",
        rubitimeServiceId: "675",
        rubitimeCooperatorId: "99",
      },
      { existingRow },
    );

    const updateSql = String(query.mock.calls[1]?.[0] ?? "");
    expect(updateSql).toContain("UPDATE public.patient_bookings");
    expect(updateSql).toContain("WHEN source = 'rubitime_projection'");
    const params = query.mock.calls[1]?.[1] as unknown[];
    expect(params?.[1]).toBe("rescheduled");
  });

  it("insert is idempotent via ON CONFLICT DO NOTHING", async () => {
    const { db, query } = createDbMock();
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 0 });

    await upsertPatientBookingFromRubitime(db, normalizePhone, {
      rubitimeId: "rt-dup",
      status: "confirmed",
      slotStart: "2026-05-01T10:00:00.000Z",
      contactPhone: "+7000",
    });

    const insertSql = String(query.mock.calls.at(-1)?.[0] ?? "");
    expect(insertSql).toContain("ON CONFLICT (rubitime_id) DO NOTHING");
  });

  it("ambiguous lookup yields minimal compat_quality on create", async () => {
    const logCompat = vi.fn();
    const { db, query } = createDbMock();
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [LOOKUP_ROW, { ...LOOKUP_ROW, branch_service_id: "other" }] })
      .mockResolvedValueOnce({ rowCount: 1 });

    await upsertPatientBookingFromRubitime(
      db,
      normalizePhone,
      {
        rubitimeId: "rt-ambig",
        status: "confirmed",
        slotStart: "2026-05-01T10:00:00.000Z",
        rubitimeBranchId: "173",
        rubitimeServiceId: "675",
      },
      { logCompat },
    );

    expect(logCompat).toHaveBeenCalledWith(
      "branch_service_lookup_ambiguous",
      expect.objectContaining({ rubitimeBranchId: "173", rubitimeServiceId: "675" }),
    );
    const insertParams = query.mock.calls.at(-1)?.[1] as unknown[];
    expect(insertParams?.[16]).toBeNull();
    expect(insertParams?.[20]).toBe("minimal");
  });
});
