import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
}));

vi.mock("@/infra/db/client", () => ({
  getPool: () => ({ query: vi.fn() }),
}));

import { pgPatientBookingsPort } from "./pgPatientBookings";

describe("pgPatientBookingsPort canonical operations", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it("markConfirmed updates status and canonical appointment id", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    await pgPatientBookingsPort.markConfirmed("pb-1", {
      canonicalAppointmentId: "00000000-0000-4000-8000-000000000001",
    });
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("canonical_appointment_id = COALESCE");
  });

  it("getById returns null when booking is missing", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    await expect(pgPatientBookingsPort.getById("missing")).resolves.toBeNull();
  });

  it("markFailedSync stores the failed state", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    await pgPatientBookingsPort.markFailedSync("pb-fail");
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("status = 'failed_sync'");
  });
});
