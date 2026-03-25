import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock, getPoolMock } = vi.hoisted(() => {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("AS total")) {
      return { rows: [{ total: "0", cancellations: "0", reschedules: "0" }] };
    }
    if (sql.includes("AS count")) {
      return { rows: [{ count: "0" }] };
    }
    return { rows: [{ c: "0" }] };
  });
  return {
    queryMock: query,
    getPoolMock: vi.fn(() => ({ query })),
  };
});

vi.mock("@/infra/db/client", () => ({
  getPool: getPoolMock,
}));

import { CANCELLATION_LAST_EVENT_EXCLUSION_SQL, createPgDoctorAppointmentsPort } from "./pgDoctorAppointments";

describe("pgDoctorAppointments cancellation rules", () => {
  beforeEach(() => {
    queryMock.mockClear();
    getPoolMock.mockClear();
  });

  it("uses the same cancellation exclusion in dashboard monthly cancellations", async () => {
    const port = createPgDoctorAppointmentsPort();
    await port.getDashboardAppointmentMetrics();

    const queries = queryMock.mock.calls.map((call) => String(call[0]));
    const monthlyCancellationQuery = queries.find(
      (sql) => sql.includes("status = 'canceled'") && sql.includes("date_trunc('month', NOW())")
    );
    expect(monthlyCancellationQuery).toBeDefined();
    expect(monthlyCancellationQuery).toContain(CANCELLATION_LAST_EVENT_EXCLUSION_SQL);
  });

  it("uses the same cancellation exclusion in getAppointmentStats aggregations", async () => {
    const port = createPgDoctorAppointmentsPort();
    await port.getAppointmentStats({ range: "today" });

    const queries = queryMock.mock.calls.map((call) => String(call[0]));
    const rangeQuery = queries.find((sql) => sql.includes("COUNT(*) FILTER (WHERE status = 'canceled'"));
    const last30Query = queries.find((sql) => sql.includes("NOW() - INTERVAL '30 days'"));

    expect(rangeQuery).toBeDefined();
    expect(last30Query).toBeDefined();
    expect(rangeQuery).toContain(CANCELLATION_LAST_EVENT_EXCLUSION_SQL);
    expect(last30Query).toContain(CANCELLATION_LAST_EVENT_EXCLUSION_SQL);
  });
});
