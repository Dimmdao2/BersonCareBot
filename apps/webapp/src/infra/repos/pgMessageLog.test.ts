import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
}));

import { createPgMessageLogPort } from "./pgMessageLog";

describe("pgMessageLog", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    runWebappPgTextMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes("COUNT(*)")) {
        return { rows: [{ c: "0" }] };
      }
      return { rows: [] };
    });
  });

  it("append inserts message_log via runWebappPgText", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        {
          id: "log-1",
          user_id: "550e8400-e29b-41d4-a716-446655440000",
          platform_user_id: "550e8400-e29b-41d4-a716-446655440000",
          sender_id: "doctor-1",
          text: "hi",
          category: "manual",
          channel_bindings_used: {},
          sent_at: new Date("2026-01-01T00:00:00.000Z"),
          outcome: "sent",
          error_message: null,
        },
      ],
    });
    const port = createPgMessageLogPort();
    const entry = await port.append({
      userId: "550e8400-e29b-41d4-a716-446655440000",
      senderId: "doctor-1",
      text: "hi",
      category: "manual",
      channelBindingsUsed: {},
      outcome: "sent",
    });
    expect(entry.id).toBe("log-1");
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("INSERT INTO message_log");
  });

  it("listByUser uses canonical-aware user filter and LIMIT/OFFSET params", async () => {
    const port = createPgMessageLogPort();
    const uid = "550e8400-e29b-41d4-a716-446655440000";
    await port.listByUser(uid, { page: 2, pageSize: 15 });

    const calls = runWebappPgTextMock.mock.calls;
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

    const listCall = runWebappPgTextMock.mock.calls.find((c) => String(c[0]).includes("ORDER BY sent_at DESC"));
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

    const countCall = runWebappPgTextMock.mock.calls.find(
      (c) => String(c[0]).includes("COUNT(*)::text AS c") && String(c[0]).includes("FROM message_log"),
    );
    expect(countCall).toBeDefined();
    expect(String(countCall![0])).toContain("WHERE");
    expect(countCall![1]).toEqual([userId, "reminder", dateFrom, dateTo]);
  });

  it("listAll without filters uses LIMIT/OFFSET only", async () => {
    const port = createPgMessageLogPort();
    await port.listAll({ page: 3, pageSize: 10, filters: {} });

    const listCall = runWebappPgTextMock.mock.calls.find((c) => String(c[0]).includes("ORDER BY sent_at DESC"));
    expect(listCall).toBeDefined();
    expect(String(listCall![0])).not.toContain("WHERE");
    expect(listCall![1]).toEqual([10, 20]);
  });
});
