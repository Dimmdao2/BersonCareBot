import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const clientQueryMock = vi.hoisted(() => vi.fn());
const connectMock = vi.hoisted(() =>
  vi.fn(async () => ({
    query: clientQueryMock,
    release: vi.fn(),
  })),
);
const getPoolMock = vi.hoisted(() => vi.fn(() => ({ connect: connectMock })));

vi.mock("@/infra/db/runWebappSql", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infra/db/runWebappSql")>();
  return {
    ...actual,
    runWebappPgText: runWebappPgTextMock,
  };
});

vi.mock("@/infra/db/client", () => ({
  getPool: getPoolMock,
}));

import { createPgAppointmentProjectionPort } from "./pgAppointmentProjection";

describe("pgAppointmentProjection softDeleteByIntegratorId", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    clientQueryMock.mockReset();
    connectMock.mockClear();
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [] };
      }
      return { rows: [], rowCount: 0 };
    });
  });

  it("runs domain SQL via runWebappPgText on tx client and commits when updated", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ deleted_at: null }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const port = createPgAppointmentProjectionPort();
    const ok = await port.softDeleteByIntegratorId("rt-record-1");

    expect(ok).toBe(true);
    expect(clientQueryMock).toHaveBeenCalledWith("BEGIN");
    expect(clientQueryMock).toHaveBeenCalledWith("COMMIT");
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(3);
    const appointmentUpdateSql = String(runWebappPgTextMock.mock.calls[1]?.[0] ?? "");
    expect(appointmentUpdateSql).toContain("appointment_records");
    const bookingUpdateSql = String(runWebappPgTextMock.mock.calls[2]?.[0] ?? "");
    expect(bookingUpdateSql).toContain("patient_bookings");
    expect(runWebappPgTextMock.mock.calls[2]?.[1]).toEqual(["rt-record-1", "admin_soft_delete"]);
  });

  it("returns false without patient_bookings update when appointment row missing", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const port = createPgAppointmentProjectionPort();
    const ok = await port.softDeleteByIntegratorId("missing");

    expect(ok).toBe(false);
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
    expect(clientQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });

  it("staff purge deletes patient_bookings when purgePatientBookings is set", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ deleted_at: null }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const port = createPgAppointmentProjectionPort();
    const ok = await port.softDeleteByIntegratorId("rt-purge", {
      purgePatientBookings: true,
      canonicalAppointmentId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      cancelReason: "staff_delete",
    });

    expect(ok).toBe(true);
    const deleteSql = String(runWebappPgTextMock.mock.calls[2]?.[0] ?? "");
    expect(deleteSql).toContain("DELETE FROM patient_bookings");
  });

  it("is idempotent when appointment_records already soft-deleted", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ deleted_at: new Date("2026-01-01") }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const port = createPgAppointmentProjectionPort();
    const ok = await port.softDeleteByIntegratorId("rt-purged", {
      purgePatientBookings: true,
      canonicalAppointmentId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      cancelReason: "staff_delete",
    });

    expect(ok).toBe(true);
    const updateSql = String(runWebappPgTextMock.mock.calls[1]?.[0] ?? "");
    expect(updateSql).not.toContain("UPDATE appointment_records");
    expect(String(runWebappPgTextMock.mock.calls[2]?.[0] ?? "")).toContain("DELETE FROM patient_bookings");
  });
});
