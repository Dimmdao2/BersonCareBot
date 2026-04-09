import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = { rows: Record<string, unknown>[] };

const { queryMock, getPoolMock } = vi.hoisted(() => {
  const query = vi.fn(async (_sql: string, _params?: unknown[]): Promise<QueryResult> => ({ rows: [] }));
  return {
    queryMock: query,
    getPoolMock: vi.fn(() => ({ query })),
  };
});

vi.mock("@/infra/db/client", () => ({
  getPool: getPoolMock,
}));

import { createPgMessageLogPort } from "./pgMessageLog";

describe("pgMessageLog", () => {
  beforeEach(() => {
    queryMock.mockClear();
    getPoolMock.mockClear();
    queryMock.mockImplementation(async (sql: string): Promise<QueryResult> => {
      if (String(sql).includes("COUNT(*)")) {
        return { rows: [{ c: "0" }] };
      }
      return { rows: [] };
    });
  });

  it("listByUser uses canonical-aware user filter and LIMIT/OFFSET params", async () => {
    const port = createPgMessageLogPort();
    const uid = "550e8400-e29b-41d4-a716-446655440000";
    await port.listByUser(uid, { page: 2, pageSize: 15 });

    const calls = queryMock.mock.calls;
    const listEntry = calls.find((c) => String(c[0]).includes("ORDER BY sent_at DESC"));
    expect(listEntry).toBeDefined();
    const listSql = String(listEntry![0]);
    const listParams = listEntry![1] as unknown[];

    expect(listSql).toContain("platform_user_id = $1::uuid");
    expect(listSql).toContain("platform_user_id IS NULL AND user_id = $1::text");
    expect(listSql).toContain("LIMIT $2");
    expect(listSql).toContain("OFFSET $3");
    expect(listParams).toEqual([uid, 15, 15]);

    const countCall = calls.find((c) => String(c[0]).includes("COUNT(*)") && String(c[0]).includes("FROM message_log"));
    expect(countCall).toBeDefined();
    expect(countCall![1]).toEqual([uid]);
  });

  it("listAll applies filters and pagination", async () => {
    const port = createPgMessageLogPort();
    const userId = "660e8400-e29b-41d4-a716-446655440000";
    const dateFrom = "2025-01-01T00:00:00.000Z";
    const dateTo = "2025-01-31T23:59:59.999Z";
    await port.listAll({
      page: 1,
      pageSize: 20,
      filters: { userId, category: "reminder", dateFrom, dateTo },
    });

    const listCall = queryMock.mock.calls.find((c) => String(c[0]).includes("ORDER BY sent_at DESC"));
    expect(listCall).toBeDefined();
    const listSql = String(listCall![0]);
    const listParams = listCall![1] as unknown[];

    expect(listSql).toContain("platform_user_id = $1::uuid");
    expect(listSql).toContain("platform_user_id IS NULL AND user_id = $1::text");
    expect(listSql).toContain("category = $2");
    expect(listSql).toContain("sent_at >= $3::timestamptz");
    expect(listSql).toContain("sent_at <= $4::timestamptz");
    expect(listSql).toContain("LIMIT $5");
    expect(listSql).toContain("OFFSET $6");
    expect(listParams).toEqual([userId, "reminder", dateFrom, dateTo, 20, 0]);

    const countCall = queryMock.mock.calls.find(
      (c) => String(c[0]).includes("COUNT(*)::text AS c") && String(c[0]).includes("FROM message_log"),
    );
    expect(countCall).toBeDefined();
    expect(String(countCall![0])).toContain("WHERE");
    expect(countCall![1]).toEqual([userId, "reminder", dateFrom, dateTo]);
  });

  it("listAll without filters uses LIMIT/OFFSET only", async () => {
    const port = createPgMessageLogPort();
    await port.listAll({ page: 3, pageSize: 10, filters: {} });

    const listCall = queryMock.mock.calls.find((c) => String(c[0]).includes("ORDER BY sent_at DESC"));
    expect(listCall).toBeDefined();
    expect(String(listCall![0])).not.toContain("WHERE");
    expect(listCall![1]).toEqual([10, 20]);
  });
});
