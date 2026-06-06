import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
  getWebappSqlFromPgClient: vi.fn(),
}));

import { createPgAppointmentProjectionPort } from "./pgAppointmentProjection";

const NOW = new Date("2026-01-01T00:00:00.000Z");

describe("createPgAppointmentProjectionPort (runWebappPgText paths)", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it("getRecordByIntegratorId returns null when no row", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgAppointmentProjectionPort();
    expect(await port.getRecordByIntegratorId("missing")).toBeNull();
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("integrator_record_id = $1");
  });

  it("upsertRecordFromProjection runs INSERT with platform_user_id resolution", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgAppointmentProjectionPort();
    await port.upsertRecordFromProjection({
      integratorRecordId: "rt-1",
      phoneNormalized: "+79991234567",
      recordAt: "2026-06-01T10:00:00.000Z",
      status: "created",
      payloadJson: { link: "https://x" },
      lastEvent: "event-create",
      updatedAt: NOW.toISOString(),
      branchId: null,
    });
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("INSERT INTO appointment_records");
    expect(sql).toContain("user_phone_history");
    expect(sql).toContain("ON CONFLICT (integrator_record_id) DO UPDATE");
  });

  it("listActiveByPhoneNormalized filters created/updated and future slots", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgAppointmentProjectionPort();
    await port.listActiveByPhoneNormalized("+79991111111");
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("status IN ('created', 'updated')");
    expect(sql).toContain("record_at >= now()");
  });
});
