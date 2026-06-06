import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

const { runWebappPgTextMock, mockGetPool } = vi.hoisted(() => ({
  runWebappPgTextMock: vi.fn(),
  mockGetPool: vi.fn(),
}));

vi.mock("@/infra/db/client", () => ({
  getPool: mockGetPool,
}));

vi.mock("@/infra/db/runWebappSql", () => ({
  getWebappSqlFromPgClient: (client: unknown) => client,
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
}));

import { createPgWebPushSubscriptionsPort } from "./pgWebPushSubscriptions";

describe("pgWebPushSubscriptions (repo SQL parity)", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    mockGetPool.mockReset();
  });

  it("saveSubscription uses TX with upsert and trim delete", async () => {
    const transportQueries: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        transportQueries.push(sql);
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    } as unknown as PoolClient;
    mockGetPool.mockReturnValue({ connect: vi.fn(async () => client) });
    runWebappPgTextMock.mockResolvedValue({ rows: [], rowCount: 1 });

    const port = createPgWebPushSubscriptionsPort();
    await port.saveSubscription(
      "550e8400-e29b-41d4-a716-446655440000",
      {
        endpoint: "https://push.example/1",
        expirationTime: null,
        keys: { p256dh: "p", auth: "a" },
      },
    );

    expect(transportQueries[0]).toBe("BEGIN");
    expect(transportQueries).toContain("COMMIT");
    expect(runWebappPgTextMock.mock.calls.some((c) => String(c[0]).includes("ON CONFLICT (endpoint)"))).toBe(true);
    expect(runWebappPgTextMock.mock.calls.some((c) => String(c[0]).includes("LIMIT $2"))).toBe(true);
  });

  it("rolls back TX when domain SQL fails", async () => {
    const transportQueries: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        transportQueries.push(sql);
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    } as unknown as PoolClient;
    mockGetPool.mockReturnValue({ connect: vi.fn(async () => client) });
    runWebappPgTextMock.mockRejectedValueOnce(new Error("upsert failed"));

    const port = createPgWebPushSubscriptionsPort();
    await expect(
      port.saveSubscription("550e8400-e29b-41d4-a716-446655440000", {
        endpoint: "https://push.example/1",
        expirationTime: null,
        keys: { p256dh: "p", auth: "a" },
      }),
    ).rejects.toThrow("upsert failed");
    expect(transportQueries).toContain("ROLLBACK");
  });

  it("hasAnyForUserId and listActiveByUserId query by user_id", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
      .mockResolvedValueOnce({
        rows: [{ endpoint: "https://push.example/1", p256dh: "p", auth: "a" }],
      });
    const port = createPgWebPushSubscriptionsPort();
    const hasAny = await port.hasAnyForUserId("550e8400-e29b-41d4-a716-446655440000");
    const list = await port.listActiveByUserId("550e8400-e29b-41d4-a716-446655440000");
    expect(hasAny).toBe(true);
    expect(list).toHaveLength(1);
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("LIMIT 1");
    expect(String(runWebappPgTextMock.mock.calls[1]?.[0])).toContain("SELECT endpoint, p256dh, auth");
  });

  it("deleteByEndpointIfExists uses rowCount guard", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const port = createPgWebPushSubscriptionsPort();
    const deleted = await port.deleteByEndpointIfExists("https://push.example/1");
    expect(deleted).toBe(false);
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("DELETE FROM user_web_push_subscriptions");
  });
});
