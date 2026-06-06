import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() =>
  vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes("AS total")) {
      return {
        rows: [
          {
            total: "0",
            past_visits: "0",
            cancelled_visits: "0",
            cancellation_actions: "0",
            reschedule_actions: "0",
          },
        ],
      };
    }
    if (sql.includes("AS count")) {
      return { rows: [{ count: "0" }] };
    }
    return { rows: [{ c: "0" }] };
  }),
);

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
}));

import { CANCELLATION_LAST_EVENT_EXCLUSION_SQL, createPgDoctorAppointmentsPort } from "./pgDoctorAppointments";

describe("pgDoctorAppointments cancellation rules", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockClear();
  });

  it("uses the same cancellation exclusion in dashboard monthly cancellations", async () => {
    const port = createPgDoctorAppointmentsPort();
    await port.getDashboardAppointmentMetrics();

    const queries = runWebappPgTextMock.mock.calls.map((call) => String(call[0]));
    const monthlyCancellationQuery = queries.find(
      (sql) => sql.includes("status = 'canceled'") && sql.includes("date_trunc('month', NOW())"),
    );
    expect(monthlyCancellationQuery).toBeDefined();
    expect(monthlyCancellationQuery).toContain(CANCELLATION_LAST_EVENT_EXCLUSION_SQL);
  });

  it("uses the same cancellation exclusion in getAppointmentStats aggregations", async () => {
    const port = createPgDoctorAppointmentsPort();
    await port.getAppointmentStats({ kind: "range", range: "today" });

    const queries = runWebappPgTextMock.mock.calls.map((call) => String(call[0]));
    const rangeQuery = queries.find(
      (sql) => sql.includes("AS past_visits") && sql.includes("status = 'canceled'"),
    );
    const last30Query = queries.find((sql) => sql.includes("NOW() - INTERVAL '30 days'"));

    expect(rangeQuery).toBeDefined();
    expect(last30Query).toBeDefined();
    expect(rangeQuery).toContain(CANCELLATION_LAST_EVENT_EXCLUSION_SQL);
    expect(last30Query).toContain(CANCELLATION_LAST_EVENT_EXCLUSION_SQL);
  });

  it("getAppointmentStats excludes soft-deleted rows", async () => {
    const port = createPgDoctorAppointmentsPort();
    await port.getAppointmentStats({ kind: "range", range: "week" });

    const queries = runWebappPgTextMock.mock.calls.map((call) => String(call[0]));
    const rangeQuery = queries.find((sql) => sql.includes("AS past_visits"));
    const last30Query = queries.find((sql) => sql.includes("NOW() - INTERVAL '30 days'"));

    expect(rangeQuery).toBeDefined();
    expect(rangeQuery).toContain("deleted_at IS NULL");
    expect(last30Query).toContain("deleted_at IS NULL");
  });

  it("statsRange list uses stats window semantics", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgDoctorAppointmentsPort();
    await port.listAppointmentsForSpecialist({ kind: "statsRange", range: "today" });

    const [sql] = runWebappPgTextMock.mock.calls[0] ?? [];
    const listSql = String(sql);
    expect(listSql).toContain("ar.record_at >= $1::timestamptz");
    expect(listSql).toContain("ar.record_at < $2::timestamptz");
    expect(listSql).not.toContain("ar.status != 'canceled'");
  });

  it("cancellations30d list reuses cancellation exclusion", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgDoctorAppointmentsPort();
    await port.listAppointmentsForSpecialist({ kind: "cancellations30d" });

    const [sql] = runWebappPgTextMock.mock.calls[0] ?? [];
    const listSql = String(sql);
    expect(listSql).toContain(CANCELLATION_LAST_EVENT_EXCLUSION_SQL);
    expect(listSql).toContain("NOW() - INTERVAL '30 days'");
  });

  it("listAppointmentsForSpecialist passes excludedUserIds as one uuid[] param", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const excluded = ["1c312a64-fab8-4b75-b24e-88a1d6ebe4e0", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"];
    const port = createPgDoctorAppointmentsPort();
    await port.listAppointmentsForSpecialist({ kind: "range", range: "today" }, { excludedUserIds: excluded });

    const [sql, params] = runWebappPgTextMock.mock.calls[0] ?? [];
    expect(String(sql)).toContain("<> ALL($3::uuid[])");
    expect(params).toHaveLength(3);
    expect(params?.[2]).toEqual(excluded);
  });
});
