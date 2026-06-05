import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() =>
  vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>>(async () => ({ rows: [] })),
);
const getPoolMock = vi.hoisted(() => vi.fn(() => ({ query: queryMock })));

vi.mock("@/infra/db/client", () => ({
  getPool: getPoolMock,
}));

import { createPgAdminPlatformUserStatsPort } from "./pgAdminPlatformUserStats";

const EXCLUDED = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"];

describe("pgAdminPlatformUserStats", () => {
  beforeEach(() => {
    queryMock.mockClear();
    getPoolMock.mockClear();
    queryMock.mockResolvedValue({ rows: [{ c: "0" }] });
  });

  it("subscriber by-day query uses non-colliding parameter indices with exclusion", async () => {
    const port = createPgAdminPlatformUserStatsPort();
    await port.getSubscriberBindingStats({
      iana: "Europe/Moscow",
      startUtcIso: "2026-05-31T21:00:00.000Z",
      endExclusiveUtcIso: "2026-06-07T21:00:00.000Z",
      excludedUserIds: EXCLUDED,
    });

    expect(queryMock).toHaveBeenCalledTimes(2);
    const byDayCall = queryMock.mock.calls.find(([sql]) => String(sql).includes("timezone("));
    expect(byDayCall).toBeDefined();
    const sql = String(byDayCall![0]);
    const params = byDayCall![1] as unknown[];
    expect(sql).toContain("timezone($1::text, s.first_at)");
    expect(sql).toContain("HAVING MIN(ucb.created_at) >= $3::timestamptz");
    expect(sql).toContain("AND MIN(ucb.created_at) < $4::timestamptz");
    expect(params[0]).toBe("Europe/Moscow");
    expect(params[1]).toEqual(EXCLUDED);
    expect(params[2]).toBe("2026-05-31T21:00:00.000Z");
    expect(params[3]).toBe("2026-06-07T21:00:00.000Z");
  });

  it("registration stats passes excludedUserIds before GROUP BY", async () => {
    queryMock.mockResolvedValue({ rows: [{ c: "1" }] });
    const port = createPgAdminPlatformUserStatsPort();
    await port.getRegistrationStats({
      iana: "Europe/Moscow",
      startUtcIso: "2026-05-31T21:00:00.000Z",
      endExclusiveUtcIso: "2026-06-07T21:00:00.000Z",
      dayKeys: ["2026-06-01"],
      excludedUserIds: EXCLUDED,
    });

    const byDayCall = queryMock.mock.calls.find(([sql]) => String(sql).includes("timezone("));
    expect(byDayCall).toBeDefined();
    const sql = String(byDayCall![0]);
    expect(sql.indexOf("<> ALL(")).toBeLessThan(sql.indexOf("GROUP BY 1"));
    expect((byDayCall![1] as unknown[])).toContain(EXCLUDED);
  });
});
